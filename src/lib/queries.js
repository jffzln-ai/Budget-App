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
export function computeLiveBalances(accounts) {
  const balances = {};
  accounts.forEach(a => { balances[a.id] = a.current_balance; });
  return balances;
}
