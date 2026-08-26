import { getAuthedHousehold } from '../_lib/auth.js';
import { plaidClient } from '../_lib/plaidClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { userId } = await getAuthedHousehold(req);
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Ledger',
      products: ['transactions'],
      country_codes: ['CA', 'US'],
      language: 'en',
      redirect_uri: process.env.APP_URL,
    });
    res.status(200).json({ link_token: response.data.link_token });
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.error_message || err.message });
  }
}
