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
  // onConflict targets the DB-level uniqueness constraint (household_id,
  // account_id, date, raw_description, amount) - if a row somehow still
  // collides with something already there despite the client-side dedup
  // check, this skips it silently instead of erroring or duplicating.
  const { error } = await supabase.from('transactions').upsert(
    rows.map(r => ({ household_id: householdId, account_id: accountId, source: 'csv_import', ...r })),
    { onConflict: 'household_id,account_id,date,raw_description,amount', ignoreDuplicates: true }
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

export async function getPlannedTransactions(householdId) {
  const { data, error } = await supabase.from('planned_transactions').select('*').eq('household_id', householdId).order('date');
  if (error) throw error;
  return data;
}

export async function addPlannedTransaction(householdId, fields) {
  const { error } = await supabase.from('planned_transactions').insert({ household_id: householdId, ...fields });
  if (error) throw error;
}

export async function removePlannedTransaction(id) {
  const { error } = await supabase.from('planned_transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function dismissRule(ruleId) {
  const { error } = await supabase.from('recurring_rules').update({ status: 'dismissed' }).eq('id', ruleId);
  if (error) throw error;
}

export async function updateRuleAmount(ruleId, amount) {
  const { error } = await supabase.from('recurring_rules').update({ expected_amount: amount }).eq('id', ruleId);
  if (error) throw error;
}

export async function updatePlannedTransaction(id, fields) {
  const { error } = await supabase.from('planned_transactions').update(fields).eq('id', id);
  if (error) throw error;
}

export async function getBudgets(householdId) {
  const { data, error } = await supabase.from('budgets').select('*').eq('household_id', householdId);
  if (error) throw error;
  return data;
}

export async function setBudget(householdId, category, monthlyLimit) {
  const { error } = await supabase.from('budgets').upsert({ household_id: householdId, category, monthly_limit: monthlyLimit });
  if (error) throw error;
}

export async function removeBudget(householdId, category) {
  const { error } = await supabase.from('budgets').delete().eq('household_id', householdId).eq('category', category);
  if (error) throw error;
}

export async function getCustomCategories(householdId) {
  const { data, error } = await supabase.from('custom_categories').select('*').eq('household_id', householdId).order('name');
  if (error) throw error;
  return data;
}

export async function addCustomCategory(householdId, name, groupName) {
  const { error } = await supabase.from('custom_categories').insert({ household_id: householdId, name, group_name: groupName });
  if (error) throw error;
}

export async function getCategoryRules(householdId) {
  const { data, error } = await supabase.from('category_rules').select('*').eq('household_id', householdId);
  if (error) throw error;
  return data;
}

export async function setCategoryRule(householdId, pattern, category) {
  const { error } = await supabase.from('category_rules').upsert({ household_id: householdId, pattern, category });
  if (error) throw error;
}

export async function removeCategoryRule(householdId, pattern) {
  const { error } = await supabase.from('category_rules').delete().eq('household_id', householdId).eq('pattern', pattern);
  if (error) throw error;
}

// Applies a category to every transaction whose description matches the
// given pattern - used for "apply to N similar transactions" after a
// manual recategorize.
export async function applyCategoryToMatching(householdId, pattern, category) {
  const { error } = await supabase.from('transactions').update({ category }).eq('household_id', householdId).eq('raw_description', pattern);
  if (error) throw error;
}

export async function linkTransfer(txnId1, txnId2) {
  const gid = `manual_${txnId1}_${txnId2}`;
  const { error: e1 } = await supabase.from('transactions').update({ transfer_group_id: gid, needs_review: false }).eq('id', txnId1);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('transactions').update({ transfer_group_id: gid, needs_review: false }).eq('id', txnId2);
  if (e2) throw e2;
}

export async function getAccountDeletionImpact(accountId) {
  const [txns, rules, planned] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    supabase.from('recurring_rules').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    supabase.from('planned_transactions').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
  ]);
  if (txns.error) throw txns.error;
  if (rules.error) throw rules.error;
  if (planned.error) throw planned.error;
  return {
    transactions: txns.count || 0,
    recurringRules: rules.count || 0,
    plannedTransactions: planned.count || 0,
  };
}

export async function deleteAccount(accountId) {
  // recurring_rules.account_id is ON DELETE SET NULL, not CASCADE - left
  // alone, a deleted account would leave orphaned rules with no account,
  // which would just silently vanish from Upcoming rather than error, but
  // it's still dead clutter in the table. Clean these up explicitly first.
  const { error: rulesErr } = await supabase.from('recurring_rules').delete().eq('account_id', accountId);
  if (rulesErr) throw rulesErr;
  // transactions and planned_transactions are ON DELETE CASCADE, so deleting
  // the account itself removes those automatically.
  const { error } = await supabase.from('accounts').delete().eq('id', accountId);
  if (error) throw error;
}

export function computeLiveBalances(accounts) {
  const balances = {};
  accounts.forEach(a => { balances[a.id] = a.current_balance; });
  return balances;
}
