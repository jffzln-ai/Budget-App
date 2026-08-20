import { supabase } from './supabaseClient.js';

export async function getHousehold(userId) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, households ( id, name )')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return { householdId: data.household_id, role: data.role, name: data.households.name };
}

export async function getAccounts(householdId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('household_id', householdId)
    .order('name');
  if (error) throw error;
  return data;
}

// Every transaction for the household, oldest first - used to derive each
// account's live balance (latest transaction's running_balance), the same
// logic the original artifact used. Fine at this data size; if this ever
// gets slow at scale, the fix is a small Postgres view doing DISTINCT ON
// (account_id) ordered by date desc, rather than fetching everything.
export async function getAllTransactions(householdId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id, date, raw_description, amount, running_balance, category, is_transfer, transfer_group_id, needs_review')
    .eq('household_id', householdId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getRecurringRules(householdId) {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('household_id', householdId);
  if (error) throw error;
  return data;
}

export async function confirmRule(ruleId) {
  const { error } = await supabase
    .from('recurring_rules')
    .update({ status: 'active' })
    .eq('id', ruleId);
  if (error) throw error;
}

export async function getNetWorthItems(householdId) {
  const { data, error } = await supabase
    .from('net_worth_items')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addNetWorthItem(householdId, item) {
  const { error } = await supabase
    .from('net_worth_items')
    .insert({ household_id: householdId, ...item });
  if (error) throw error;
}

export async function removeNetWorthItem(itemId) {
  const { error } = await supabase.from('net_worth_items').delete().eq('id', itemId);
  if (error) throw error;
}

// current_balance is the authoritative balance for every account. There's no
// CSV import in the app yet, so nothing can make this stale - deriving a
// balance from transaction history instead would need to handle same-day
// ordering (no sequence column exists) and gaps in that history (several
// accounts, e.g. the travel card, have known incomplete coverage), and get
// the credit-card-vs-asset sign convention right on top of that. Once CSV
// import is built, the right fix is updating current_balance as part of
// that import - not re-deriving it from possibly-incomplete data on every render.
// Just the fields needed to build a dedupe key against a new import - not
// the full row, since this only needs to answer "have I seen this exact
// transaction before", not display anything.
export async function getExistingTransactionKeys(householdId, accountId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('date, raw_description, amount')
    .eq('household_id', householdId)
    .eq('account_id', accountId);
  if (error) throw error;
  return new Set(data.map(t => `${t.date}|${t.raw_description}|${t.amount}`));
}

export async function insertTransactions(householdId, accountId, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('transactions').insert(
    rows.map(r => ({ household_id: householdId, account_id: accountId, source: 'csv_import', ...r }))
  );
  if (error) throw error;
}

export async function updateTransaction(transactionId, fields) {
  const { error } = await supabase.from('transactions').update(fields).eq('id', transactionId);
  if (error) throw error;
}

// Tags joined through transactions so RLS (which checks the transaction's
// household_id) applies without needing a household_id column on the tags
// table itself.
export async function getTransactionTags(householdId) {
  const { data, error } = await supabase
    .from('transaction_tags')
    .select('transaction_id, tag, transactions!inner(household_id)')
    .eq('transactions.household_id', householdId);
  if (error) throw error;
  const map = {};
  data.forEach(t => { (map[t.transaction_id] = map[t.transaction_id] || []).push(t.tag); });
  return map;
}

export async function addTransactionTag(transactionId, tag) {
  const { error } = await supabase.from('transaction_tags').insert({ transaction_id: transactionId, tag });
  if (error) throw error;
}

export async function removeTransactionTag(transactionId, tag) {
  const { error } = await supabase.from('transaction_tags').delete().eq('transaction_id', transactionId).eq('tag', tag);
  if (error) throw error;
}

export async function toggleSkipOccurrence(ruleId, currentSkippedDates, date) {
  const isSkipped = currentSkippedDates.includes(date);
  const next = isSkipped ? currentSkippedDates.filter(d => d !== date) : [...currentSkippedDates, date];
  const { error } = await supabase.from('recurring_rules').update({ skipped_dates: next }).eq('id', ruleId);
  if (error) throw error;
}

export async function getUnmatchedTransferCandidates(householdId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id, date, raw_description, amount')
    .eq('household_id', householdId)
    .eq('is_transfer', true)
    .is('transfer_group_id', null);
  if (error) throw error;
  return data;
}

// PostgREST doesn't support a single bulk update with different values per
// row, so this is a loop of individual updates - fine at the scale a
// reconcile pass actually touches (a handful of transactions per import).
export async function applyTransferMatches(matches) {
  for (const m of matches) {
    const { error } = await supabase.from('transactions').update({ transfer_group_id: m.transfer_group_id, needs_review: false }).eq('id', m.id);
    if (error) throw error;
  }
}

export async function insertRecurringRuleCandidates(householdId, candidates) {
  if (!candidates.length) return;
  const { error } = await supabase.from('recurring_rules').insert(
    candidates.map(c => ({ household_id: householdId, ...c }))
  );
  if (error) throw error;
}

export function computeLiveBalances(accounts) {
  const balances = {};
  accounts.forEach(a => { balances[a.id] = a.current_balance; });
  return balances;
}
