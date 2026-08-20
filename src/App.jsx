import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { getHousehold } from './lib/queries.js';
import Overview from './Overview.jsx';
import Transactions from './Transactions.jsx';
import Upcoming from './Upcoming.jsx';
import Allocations from './Allocations.jsx';

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
    try {
      const { error } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); return; }
      if (mode === 'signup') setSignedUpMsg(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
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

function DashboardScreen({ session }) {
  const [household, setHousehold] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await getHousehold(session.user.id);
        if (!cancelled) setHousehold(h);
      } catch (err) {
        if (!cancelled) setLoadErr(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [session.user.id]);

  return (
    <div style={{ minHeight: '100vh', background: '#16201C', fontFamily: "'Inter', sans-serif", padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: '#F8F6F0' }}>Ledger</div>
            <div style={{ fontSize: 12, color: 'rgba(248,246,240,0.55)', marginTop: 2 }}>{session.user.email}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <nav style={{ display: 'flex', gap: 16 }}>
              {['overview', 'transactions', 'upcoming', 'allocations', 'import'].map(t => {
                const enabled = t === 'overview' || t === 'transactions' || t === 'upcoming' || t === 'allocations';
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    disabled={!enabled}
                    style={{
                      background: 'none', border: 'none', padding: '4px 0', fontSize: 13, fontWeight: 600,
                      textTransform: 'capitalize', cursor: enabled ? 'pointer' : 'default',
                      color: t === tab ? '#F8F6F0' : enabled ? 'rgba(248,246,240,0.55)' : 'rgba(248,246,240,0.25)',
                      borderBottom: t === tab ? '2px solid #B8894A' : '2px solid transparent',
                    }}
                  >{t}{!enabled ? ' (soon)' : ''}</button>
                );
              })}
            </nav>
            <button onClick={() => supabase.auth.signOut()} style={{ background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
          </div>
        </header>

        {loadErr && <div style={{ color: '#9C4A34' }}>Couldn't load your household: {loadErr}</div>}
        {!loadErr && !household && <div style={{ color: 'rgba(248,246,240,0.6)' }}>Loading…</div>}
        {household && tab === 'overview' && <Overview householdId={household.householdId} />}
        {household && tab === 'transactions' && <Transactions householdId={household.householdId} />}
        {household && tab === 'upcoming' && <Upcoming householdId={household.householdId} />}
        {household && tab === 'allocations' && <Allocations householdId={household.householdId} />}
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
  return session ? <DashboardScreen session={session} /> : <AuthScreen />;
}
