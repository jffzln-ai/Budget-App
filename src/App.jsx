import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { getHousehold } from './lib/queries.js';
import Overview from './Overview.jsx';
import Transactions from './Transactions.jsx';
import Upcoming from './Upcoming.jsx';
import Allocations from './Allocations.jsx';
import Import from './Import.jsx';
import { IconHome, IconList, IconClock, IconMore, IconLayers, IconUpload } from './lib/icons.jsx';

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

const CORE_TABS = [
  { key: 'overview', label: 'Overview', Icon: IconHome },
  { key: 'transactions', label: 'Transactions', Icon: IconList },
  { key: 'upcoming', label: 'Upcoming', Icon: IconClock },
];
const MENU_TABS = [
  { key: 'allocations', label: 'Allocations', Icon: IconLayers },
  { key: 'import', label: 'Import', Icon: IconUpload },
];

function DashboardScreen({ session }) {
  const [household, setHousehold] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('overview');
  const [pendingAccountFilter, setPendingAccountFilter] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  function goToAccountTransactions(accountId) {
    setPendingAccountFilter(accountId);
    setTab('transactions');
  }

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

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeMenuTab = MENU_TABS.find(t => t.key === tab);

  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EA', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 100px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: '#1B211D' }}>Ledger</div>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: '1px solid #E3DECF', background: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            ><IconMore color="#1B211D" /></button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 46, background: '#FFFFFF', borderRadius: 14,
                boxShadow: '0 8px 28px rgba(27,33,29,0.14)', minWidth: 200, overflow: 'hidden', zIndex: 20,
              }}>
                {MENU_TABS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setTab(key); setMenuOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
                      background: tab === key ? '#F4F1EA' : 'none', border: 'none', cursor: 'pointer',
                      fontSize: 13.5, fontWeight: 500, color: '#1B211D', textAlign: 'left',
                    }}
                  ><Icon color="#1F4D3D" />{label}</button>
                ))}
                <div style={{ height: 1, background: '#E3DECF' }} />
                <div style={{ padding: '10px 16px', fontSize: 11.5, color: '#6B7268' }}>{session.user.email}</div>
                <button
                  onClick={() => supabase.auth.signOut()}
                  style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: '#9C4A34', textAlign: 'left' }}
                >Sign out</button>
              </div>
            )}
          </div>
        </header>

        {activeMenuTab && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12.5, color: '#6B7268' }}>
            <button onClick={() => setTab('overview')} style={{ background: 'none', border: 'none', color: '#6B7268', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>Overview</button>
            <span>/</span>
            <span style={{ color: '#1B211D', fontWeight: 600 }}>{activeMenuTab.label}</span>
          </div>
        )}

        {loadErr && <div style={{ color: '#9C4A34' }}>Couldn't load your household: {loadErr}</div>}
        {!loadErr && !household && <div style={{ color: '#6B7268' }}>Loading…</div>}
        {household && tab === 'overview' && <Overview householdId={household.householdId} onSelectAccount={goToAccountTransactions} />}
        {household && tab === 'transactions' && <Transactions householdId={household.householdId} initialAccountFilter={pendingAccountFilter} onConsumeInitialFilter={() => setPendingAccountFilter(null)} />}
        {household && tab === 'upcoming' && <Upcoming householdId={household.householdId} />}
        {household && tab === 'allocations' && <Allocations householdId={household.householdId} />}
        {household && tab === 'import' && <Import householdId={household.householdId} />}
      </div>

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: '#FFFFFF', borderTop: '1px solid #E3DECF',
        display: 'flex', justifyContent: 'center', padding: '8px 0', boxShadow: '0 -4px 16px rgba(27,33,29,0.06)',
      }}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 400, width: '100%', justifyContent: 'space-around' }}>
          {CORE_TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <Icon color={active ? '#1F4D3D' : '#A8A399'} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? '#1F4D3D' : '#A8A399' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
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
