import { getAuthedHousehold } from '../_lib/auth.js';
import { plaidClient } from '../_lib/plaidClient.js';
import { categorizeRaw } from '../../src/lib/categorize.js';
import { matchTransfers, detectNewRecurring } from '../../src/lib/reconcile.js';

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function normalizeKey(desc) { return desc.trim().toUpperCase().replace(/\s+/g, ' '); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { supabaseAdmin, householdId } = await getAuthedHousehold(req);
    const { plaid_item_id } = req.body || {};
    if (!plaid_item_id) return res.status(400).json({ error: 'Missing plaid_item_id' });

    const { data: item, error: itemErr } = await supabaseAdmin
      .from('plaid_items').select('*').eq('id', plaid_item_id).eq('household_id', householdId).single();
    if (itemErr || !item) throw new Error('Plaid connection not found for this household');

    const { data: mappedAccounts, error: accErr } = await supabaseAdmin
      .from('accounts').select('*').eq('plaid_item_id', plaid_item_id);
    if (accErr) throw accErr;
    const accountByPlaidId = {};
    mappedAccounts.forEach(a => { accountByPlaidId[a.plaid_account_id] = a; });

    // --- pull everything new since the last sync (paginated) ---
    let cursor = item.sync_cursor || undefined;
    let added = [], modified = [], removed = [];
    let hasMore = true;
    while (hasMore) {
      const response = await plaidClient.transactionsSync({ access_token: item.access_token, cursor });
      added = added.concat(response.data.added);
      modified = modified.concat(response.data.modified);
      removed = removed.concat(response.data.removed);
      hasMore = response.data.has_more;
      cursor = response.data.next_cursor;
    }

    if (removed.length) {
      await supabaseAdmin.from('transactions').delete().in('plaid_transaction_id', removed.map(r => r.transaction_id));
    }

    for (const t of modified) {
      if (t.pending) continue;
      await supabaseAdmin.from('transactions')
        .update({ date: t.date, raw_description: t.name, amount: round2(-t.amount) })
        .eq('plaid_transaction_id', t.transaction_id);
    }

    // --- categorize new transactions with the same engine CSV import uses ---
    const { data: categoryRules } = await supabaseAdmin.from('category_rules').select('*').eq('household_id', householdId);
    const ruleByPattern = {};
    (categoryRules || []).forEach(r => { ruleByPattern[r.pattern] = r.category; });

    const toInsert = [];
    for (const t of added) {
      if (t.pending) continue; // wait for it to post before treating it as real
      const account = accountByPlaidId[t.account_id];
      if (!account) continue; // this Plaid account hasn't been mapped to a Ledger account yet
      const amount = round2(-t.amount); // Plaid: positive = money out. Ours: positive = inflow.
      const cat = categorizeRaw(t.name, amount, { type: account.type, name: account.name });
      const category = !cat.is_transfer && ruleByPattern[t.name] ? ruleByPattern[t.name] : cat.category;
      toInsert.push({
        household_id: householdId, account_id: account.id, date: t.date, raw_description: t.name,
        amount, running_balance: null, category, is_transfer: cat.is_transfer, needs_review: cat.needs_review,
        plaid_transaction_id: t.transaction_id, source: 'plaid',
      });
    }
    if (toInsert.length) {
      const { error: insertErr } = await supabaseAdmin.from('transactions').upsert(toInsert, {
        onConflict: 'household_id,account_id,date,raw_description,amount', ignoreDuplicates: true,
      });
      if (insertErr) throw insertErr;
    }

    // --- refresh account balances (Plaid doesn't give a per-transaction
    // running balance the way a CSV export does, so this is how
    // current_balance - the number the rest of the app trusts - stays live) ---
    try {
      const balResp = await plaidClient.accountsBalanceGet({ access_token: item.access_token });
      for (const a of balResp.data.accounts) {
        const mapped = accountByPlaidId[a.account_id];
        if (mapped && a.balances?.current != null) {
          await supabaseAdmin.from('accounts').update({ current_balance: a.balances.current }).eq('id', mapped.id);
        }
      }
    } catch {
      // Balance refresh failing shouldn't block the transaction sync itself.
    }

    await supabaseAdmin.from('plaid_items')
      .update({ sync_cursor: cursor, last_synced_at: new Date().toISOString(), status: 'active' })
      .eq('id', plaid_item_id);

    // --- same reconciliation pass CSV import runs: match transfers, detect new recurring bills ---
    const { data: unmatchedCandidates } = await supabaseAdmin
      .from('transactions').select('id, account_id, date, raw_description, amount')
      .eq('household_id', householdId).eq('is_transfer', true).is('transfer_group_id', null);
    const transferMatches = matchTransfers(unmatchedCandidates || []);
    for (const m of transferMatches) {
      await supabaseAdmin.from('transactions')
        .update({ transfer_group_id: m.transfer_group_id, needs_review: false }).eq('id', m.id);
    }

    const [{ data: allTxns }, { data: tagRows }, { data: existingRules }] = await Promise.all([
      supabaseAdmin.from('transactions').select('*').eq('household_id', householdId),
      supabaseAdmin.from('transaction_tags').select('transaction_id, tag, transactions!inner(household_id)').eq('transactions.household_id', householdId),
      supabaseAdmin.from('recurring_rules').select('*').eq('household_id', householdId),
    ]);
    const tagsById = {};
    (tagRows || []).forEach(t => { (tagsById[t.transaction_id] = tagsById[t.transaction_id] || []).push(t.tag); });
    const existingKeys = new Set();
    (existingRules || []).forEach(r => (r.match_keys || []).forEach(mk => existingKeys.add(r.account_id + '::' + normalizeKey(mk))));
    const newRuleCandidates = detectNewRecurring(allTxns || [], tagsById, existingKeys);
    if (newRuleCandidates.length) {
      await supabaseAdmin.from('recurring_rules').insert(newRuleCandidates.map(c => ({ household_id: householdId, ...c })));
    }

    res.status(200).json({
      added: toInsert.length, modified: modified.length, removed: removed.length,
      transferMatches: transferMatches.length / 2, newRecurringPatterns: newRuleCandidates.length,
    });
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.error_message || err.message });
  }
}
