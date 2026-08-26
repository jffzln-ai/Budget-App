import { createClient } from '@supabase/supabase-js';

// Server-only client using the service-role key - bypasses RLS entirely,
// which is exactly why this file lives under api/_lib and never gets
// imported into anything that ships to the browser.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verifies the caller's Supabase session (sent as a Bearer token from the
// browser's existing auth session) and resolves it to their household.
// This is the one thing standing between "a logged-in user can manage
// their own bank connections" and "anyone who can call this endpoint can
// read anyone's bank connections" - every Plaid handler must call this
// first and use the returned householdId to scope every subsequent query.
export async function getAuthedHousehold(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing auth token');

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error('Invalid or expired session');

  const { data: member, error: memberErr } = await supabaseAdmin
    .from('household_members')
    .select('household_id')
    .eq('user_id', userData.user.id)
    .single();
  if (memberErr || !member) throw new Error('No household found for this user');

  return { supabaseAdmin, householdId: member.household_id, userId: userData.user.id };
}
