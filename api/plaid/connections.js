import { getAuthedHousehold } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { supabaseAdmin, householdId } = await getAuthedHousehold(req);
    const { data, error } = await supabaseAdmin
      .from('plaid_items')
      .select('id, institution_name, status, last_synced_at, created_at')
      .eq('household_id', householdId)
      .order('created_at');
    if (error) throw error;
    res.status(200).json({ connections: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
