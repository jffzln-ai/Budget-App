import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient.js';

const styles = {
  page: {
    minHeight: '100vh', background: '#16201C', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: "'Inter', sans-serif", padding: 20,
  },
  card: {
    background: '#F8F6F0', borderRadius: 8, padding: 32, width: 360, maxWidth: '100%',
    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
  },
  title: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: '#1B211D', marginBottom: 4 },
  sub: { fontSize: 13, color: '#6B7268', marginBottom: 20 },
  field: {
    width: '100%', padding: '10px 12px', border: '1px solid #E3DECF', borderRadius: 4,
    fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
  },
  button: {
    width: '100%', padding: '11px 12px', background: '#1F4D3D', color: '#F8F6F0', border: 'none',
    borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 6,
  },
  linkBtn: {
    width: '100%', padding: '8px', background: 'none', border: 'none', color: '#6B7268',
    fontSize: 12.5, cursor: 'pointer', marginTop: 10, textDecoration: 'underline',
  },
  error: { color: '#9C4A34', fontSize: 12.5, marginBottom: 10 },
  num: { fontFamily: "'IBM Plex Mono', monospace" },
};

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signedUpMsg, setSignedUpMsg] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    if (mode === 'signup') setSignedUpMsg(true);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Ledger</div>
        <div style={styles.sub}>{mode === 'signin' ? 'Sign in to your household' : 'Create your account'}</div>
        {signedUpMsg ? (
          <div style={{ fontSize: 13.5, color: '#1B211D', lineHeight: 1.5 }}>
            Account created. If email confirmation is on for this project, check your inbox before signing in.
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && <div style={styles.error}>{error}</div>}
            <input style={styles.field} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            <input style={styles.field} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          </form>
        )}
        <button style={styles.linkBtn} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setSignedUpMsg(false); }}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

function HouseholdScreen({ session }) {
  const [household, setHousehold] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('role, households ( id, name )')
        .eq('user_id', session.user.id)
        .single();
      if (cancelled) return;
      if (error) setLoadErr(error.message);
      else setHousehold(data);
    })();
    return () => { cancelled = true; };
  }, [session.user.id]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Ledger</div>
        <div style={styles.sub}>Signed in as {session.user.email}</div>
        {loadErr && <div style={styles.error}>Couldn't load your household: {loadErr}</div>}
        {!loadErr && !household && <div style={{ fontSize: 13.5, color: '#6B7268' }}>Loading…</div>}
        {household && (
          <div style={{ fontSize: 14, color: '#1B211D', lineHeight: 1.6 }}>
            Household: <strong>{household.households.name}</strong><br />
            Your role: <span style={styles.num}>{household.role}</span>
            <div style={{ fontSize: 12, color: '#6B7268', marginTop: 10 }}>
              This confirms auth, RLS, and the household bootstrap trigger are all working end to end. The real dashboard gets built on top of this next.
            </div>
          </div>
        )}
        <button style={styles.button} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div style={styles.page}><div style={{ color: '#F8F6F0' }}>Loading…</div></div>;
  return session ? <HouseholdScreen session={session} /> : <AuthScreen />;
}
