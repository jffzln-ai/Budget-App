import { getAuthedHousehold } from '../_lib/auth.js';

// Plaid's type/subtype vocabulary doesn't match ours - only matters when
// creating a brand-new account; mapping to an existing one keeps whatever
// type that account already has.
function inferAccountType(plaidType, plaidSubtype) {
  if (plaidType === 'credit') return 'credit_card';
  if (plaidType === 'loan' && plaidSubtype === 'line of credit') return 'line_of_credit';
  if (plaidType === 'investment') return 'investment';
  if (plaidSubtype === 'savings') return 'savings';
  return 'chequing';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { supabaseAdmin, householdId } = await getAuthedHousehold(req);
    const { plaid_item_id, plaid_account_id, existing_account_id, new_account } = req.body || {};
    if (!plaid_item_id || !plaid_account_id) {
      return res.status(400).json({ error: 'Missing plaid_item_id or plaid_account_id' });
    }

    // Confirm this Plaid item actually belongs to the caller's household -
    // without this check, a forged plaid_item_id from a different
    // household could attach someone else's bank data to your accounts.
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('plaid_items').select('id').eq('id', plaid_item_id).eq('household_id', householdId).single();
    if (itemErr || !item) throw new Error('Plaid connection not found for this household');

    let accountId = existing_account_id;
    if (!accountId && new_account) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('accounts')
        .insert({
          household_id: householdId, name: new_account.name,
          type: inferAccountType(new_account.plaid_type, new_account.plaid_subtype),
          purpose: 'personal', institution: new_account.institution || null,
          current_balance: new_account.current_balance ?? 0,
        })
        .select().single();
      if (createErr) throw createErr;
      accountId = created.id;
    }
    if (!accountId) return res.status(400).json({ error: 'Provide either existing_account_id or new_account' });

    const { error: updateErr } = await supabaseAdmin
      .from('accounts')
      .update({ plaid_item_id, plaid_account_id })
      .eq('id', accountId)
      .eq('household_id', householdId);
    if (updateErr) throw updateErr;

    res.status(200).json({ account_id: accountId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
