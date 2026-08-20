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

export function computeLiveBalances(accounts, transactions) {
  const latestByAccount = {};
  transactions.forEach(t => {
    const cur = latestByAccount[t.account_id];
    if (!cur || t.date >= cur.date) latestByAccount[t.account_id] = t;
  });
  const balances = {};
  accounts.forEach(a => {
    balances[a.id] = latestByAccount[a.id] ? latestByAccount[a.id].running_balance : a.current_balance;
  });
  return balances;
}
