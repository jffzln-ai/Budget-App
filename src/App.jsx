import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { getHousehold } from './lib/queries.js';
import { THEMES, applyTheme, getStoredTheme, setStoredTheme } from './lib/themes.js';
import Overview from './Overview.jsx';
import Transactions from './Transactions.jsx';
import Upcoming from './Upcoming.jsx';
import Allocations from './Allocations.jsx';
import NetWorth from './NetWorth.jsx';
import Reimbursements from './Reimbursements.jsx';
import Import from './Import.jsx';
import { IconHome, IconList, IconClock, IconMore, IconLayers, IconUpload, IconTrendingUp, IconReceipt } from './lib/icons.jsx';

const styles = {
  page: {
    minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: "'Inter', sans-serif", padding: 20,
  },
  card: {
    background: 'var(--card)', borderRadius: 8, padding: 32, width: 360, maxWidth: '100%',
    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
  },
  title: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 },
  sub: { fontSize: 13, color: 'var(--ink-soft)', marginBottom: 20 },
  field: {
    width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 4,
    fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
  },
  button: {
    width: '100%', padding: '11px 12px', background: 'var(--pine)', color: 'var(--hero-text)', border: 'none',
    borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 6,
  },
  linkBtn: {
    width: '100%', padding: '8px', background: 'none', border: 'none', color: 'var(--ink-soft)',
    fontSize: 12.5, cursor: 'pointer', marginTop: 10, textDecoration: 'underline',
  },
  error: { color: 'var(--rust)', fontSize: 12.5, marginBottom: 10 },
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
          <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
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
  { key: 'networth', label: 'Net Worth', Icon: IconTrendingUp },
  { key: 'reimbursements', label: 'Reimbursements', Icon: IconReceipt },
  { key: 'allocations', label: 'Allocations', Icon: IconLayers },
  { key: 'import', label: 'Import', Icon: IconUpload },
];

function DashboardScreen({ session, theme, setTheme }) {
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

  function handleThemeChange(key) {
    setTheme(key);
    applyTheme(key);
    setStoredTheme(key);
  }

  const activeMenuTab = MENU_TABS.find(t => t.key === tab);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 100px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>Ledger</div>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            ><IconMore color="var(--ink)" /></button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 46, background: 'var(--card)', borderRadius: 14,
                boxShadow: '0 8px 28px rgba(27,33,29,0.14)', minWidth: 210, overflow: 'hidden', zIndex: 20,
              }}>
                {MENU_TABS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setTab(key); setMenuOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
                      background: tab === key ? 'var(--cream-tint)' : 'none', border: 'none', cursor: 'pointer',
                      fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textAlign: 'left',
                    }}
                  ><Icon color="var(--pine)" />{label}</button>
                ))}
                <div style={{ height: 1, background: 'var(--line)' }} />
                <div style={{ padding: '10px 16px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Appearance</div>
                <div style={{ display: 'flex', gap: 6, padding: '4px 16px 10px' }}>
                  {Object.entries(THEMES).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => handleThemeChange(key)}
                      title={t.label}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                        border: theme === key ? '2px solid var(--pine)' : '2px solid transparent',
                        padding: 0, background: 'none',
                      }}
                    >
                      <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: t.card, border: `1px solid ${t.line}`, boxShadow: `inset 0 0 0 6px ${t.pine}` }} />
                    </button>
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--line)' }} />
                <div style={{ padding: '10px 16px', fontSize: 11.5, color: 'var(--ink-soft)' }}>{session.user.email}</div>
                <button
                  onClick={() => supabase.auth.signOut()}
                  style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: 'var(--rust)', textAlign: 'left' }}
                >Sign out</button>
              </div>
            )}
          </div>
        </header>

        {activeMenuTab && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12.5, color: 'var(--ink-soft)' }}>
            <button onClick={() => setTab('overview')} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>Overview</button>
            <span>/</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{activeMenuTab.label}</span>
          </div>
        )}

        {loadErr && <div style={{ color: 'var(--rust)' }}>Couldn't load your household: {loadErr}</div>}
        {!loadErr && !household && <div style={{ color: 'var(--ink-soft)' }}>Loading…</div>}
        {household && tab === 'overview' && <Overview householdId={household.householdId} onSelectAccount={goToAccountTransactions} />}
        {household && tab === 'transactions' && <Transactions householdId={household.householdId} initialAccountFilter={pendingAccountFilter} onConsumeInitialFilter={() => setPendingAccountFilter(null)} />}
        {household && tab === 'upcoming' && <Upcoming householdId={household.householdId} />}
        {household && tab === 'networth' && <NetWorth householdId={household.householdId} />}
        {household && tab === 'reimbursements' && <Reimbursements householdId={household.householdId} />}
        {household && tab === 'allocations' && <Allocations householdId={household.householdId} />}
        {household && tab === 'import' && <Import householdId={household.householdId} />}
      </div>

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--nav-bg)', borderTop: '1px solid var(--line)',
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
                <Icon color={active ? 'var(--pine)' : 'var(--ink-soft)'} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? 'var(--pine)' : 'var(--ink-soft)' }}>{label}</span>
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
  const [theme, setTheme] = useState(getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div style={styles.page}><div style={{ color: 'var(--hero-text)' }}>Loading…</div></div>;
  return session ? <DashboardScreen session={session} theme={theme} setTheme={setTheme} /> : <AuthScreen />;
}
