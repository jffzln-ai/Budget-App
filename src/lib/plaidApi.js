import { supabase } from './supabaseClient.js';

async function authedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export function createLinkToken() {
  return authedFetch('/api/plaid/create-link-token', { method: 'POST' });
}
export function exchangePublicToken(public_token) {
  return authedFetch('/api/plaid/exchange-token', { method: 'POST', body: JSON.stringify({ public_token }) });
}
export function getConnections() {
  return authedFetch('/api/plaid/connections');
}
export function mapAccount(payload) {
  return authedFetch('/api/plaid/map-account', { method: 'POST', body: JSON.stringify(payload) });
}
export function syncItem(plaid_item_id) {
  return authedFetch('/api/plaid/sync', { method: 'POST', body: JSON.stringify({ plaid_item_id }) });
}
