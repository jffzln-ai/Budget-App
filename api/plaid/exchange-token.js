import { getAuthedHousehold } from '../_lib/auth.js';
import { plaidClient } from '../_lib/plaidClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { supabaseAdmin, householdId } = await getAuthedHousehold(req);
    const { public_token } = req.body || {};
    if (!public_token) return res.status(400).json({ error: 'Missing public_token' });

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchange.data;

    let institution_id = null, institution_name = null;
    try {
      const itemInfo = await plaidClient.itemGet({ access_token });
      institution_id = itemInfo.data.item.institution_id;
      if (institution_id) {
        const inst = await plaidClient.institutionsGetById({ institution_id, country_codes: ['CA', 'US'] });
        institution_name = inst.data.institution.name;
      }
    } catch {
      // Institution lookup is cosmetic (just a display name) - don't fail
      // the whole connection over it.
    }

    const { data: itemRow, error: insertErr } = await supabaseAdmin
      .from('plaid_items')
      .insert({ household_id: householdId, item_id, access_token, institution_id, institution_name })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const accountsResp = await plaidClient.accountsGet({ access_token });
    const accounts = accountsResp.data.accounts.map(a => ({
      plaid_account_id: a.account_id,
      name: a.name,
      official_name: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      current_balance: a.balances?.current ?? null,
    }));

    res.status(200).json({ plaid_item_id: itemRow.id, institution_name, accounts });
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.error_message || err.message });
  }
}
