import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { getHousehold } from './lib/queries.js';
import { THEME_PREFS, applyTheme, getStoredTheme, setStoredTheme, watchSystemTheme } from './lib/themes.js';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { LoadingState, ErrorState } from './lib/states.jsx';
import Overview from './Overview.jsx';
import Transactions from './Transactions.jsx';
import Upcoming from './Upcoming.jsx';
import Allocations from './Allocations.jsx';
import NetWorth from './NetWorth.jsx';
import Reimbursements from './Reimbursements.jsx';
import Import from './Import.jsx';
import { getConnections, syncItem } from './lib/plaidApi.js';
import { IconHome, IconList, IconClock, IconGrid, IconLayers, IconUpload, IconTrendingUp, IconReceipt, IconRefresh, IconClose, IconChevronRight } from './lib/icons.jsx';

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
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(var(--safe-top) + 16px) 16px calc(var(--safe-bottom) + 16px)' }}>
      <div className="card" style={{ width: 360, maxWidth: '100%', padding: 32, gap: 16, boxShadow: 'var(--e2)' }}>
        <div>
          <div className="t-28 display">Ledger</div>
          <div className="t-14 muted">{mode === 'signin' ? 'Sign in to your household' : 'Create your account'}</div>
        </div>
        {signedUpMsg ? (
          <div className="t-14">Account created. If email confirmation is on for this project, check your inbox before signing in.</div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {error && <div className="field-error" role="alert">{error}</div>}
            <label className="sr-only" htmlFor="auth-email">Email</label>
            <input id="auth-email" className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            <label className="sr-only" htmlFor="auth-password">Password</label>
            <input id="auth-password" className="input" type="password" placeholder="Password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <button className="btn btn-primary btn-block" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          </form>
        )}
        <button className="btn btn-quiet btn-sm" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setSignedUpMsg(false); }}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

// Four destinations in the tab bar plus More; the sidebar shows everything.
const TAB_BAR = [
  { key: 'overview', label: 'Overview', Icon: IconHome },
  { key: 'transactions', label: 'Transactions', Icon: IconList },
  { key: 'upcoming', label: 'Upcoming', Icon: IconClock },
  { key: 'networth', label: 'Net worth', Icon: IconTrendingUp },
];
const MORE_TABS = [
  { key: 'reimbursements', label: 'Reimbursements', Icon: IconReceipt },
  { key: 'allocations', label: 'Allocations', Icon: IconLayers },
  { key: 'import', label: 'Import', Icon: IconUpload },
];
const ALL_TABS = [...TAB_BAR, ...MORE_TABS];

function todayLabel() {
  return new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

function ThemeSwitch({ theme, onChange, idPrefix }) {
  return (
    <div className="segmented" role="group" aria-labelledby={`${idPrefix}-appearance`}>
      {THEME_PREFS.map(p => (
        <button key={p.key} type="button" aria-pressed={theme === p.key} onClick={() => onChange(p.key)}>{p.label}</button>
      ))}
    </div>
  );
}

function DashboardScreen({ session, theme, onThemeChange }) {
  const toast = useToast();
  const [household, setHousehold] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('overview');
  const [pendingAccountFilter, setPendingAccountFilter] = useState(null);
  const [pendingBreakdownOpen, setPendingBreakdownOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Bumped after a sync. Pages reload their data in place when it changes,
  // instead of being remounted (which flashed the whole page back to loading).
  const [refreshKey, setRefreshKey] = useState(0);
  const moreBtnRef = useRef(null);
  const sheetRef = useRef(null);
  const sheetCloseRef = useRef(null);

  async function handleSyncAll() {
    setSyncing(true);
    try {
      const { connections } = await getConnections();
      if (!connections.length) {
        toast('No banks connected yet. Connect one from Import.');
        return;
      }
      let added = 0;
      for (const c of connections) {
        const result = await syncItem(c.id);
        added += result.added;
      }
      toast(added > 0 ? `Synced: ${added} new transaction${added === 1 ? '' : 's'}` : 'Synced: everything is up to date');
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast(`Sync failed: ${err.message}`, { error: true });
    } finally {
      setSyncing(false);
    }
  }

  function go(key) {
    setTab(key);
    setSheetOpen(false);
    window.scrollTo(0, 0);
  }

  function goToAccountTransactions(accountId) {
    setPendingAccountFilter(accountId);
    go('transactions');
  }

  function goToSpendingBreakdown() {
    setPendingBreakdownOpen(true);
    go('transactions');
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

  // iOS: the large page title collapses into the frosted top bar once scrolled.
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => root.classList.toggle('is-scrolled', window.scrollY > 44);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); root.classList.remove('is-scrolled'); };
  }, []);

  // More sheet: focus moves in on open, Escape closes, Tab stays inside, focus returns to More.
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    moreBtnRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!sheetOpen) return;
    const t = setTimeout(() => sheetCloseRef.current?.focus({ preventScroll: true }), 60);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = [...sheetRef.current.querySelectorAll('button:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [sheetOpen, closeSheet]);

  const activeLabel = ALL_TABS.find(t => t.key === tab)?.label || 'Overview';
  const inMore = MORE_TABS.some(t => t.key === tab);
  const hid = household?.householdId;

  const syncButton = (
    <button
      type="button"
      className={`btn btn-secondary btn-sm sync-btn${syncing ? ' is-spinning' : ''}`}
      onClick={handleSyncAll}
      disabled={syncing}
      aria-busy={syncing}
      aria-label={syncing ? 'Syncing accounts' : 'Sync accounts'}
      title="Sync connected bank accounts"
    >
      <IconRefresh />
      <span className="sync-label" aria-hidden="true">{syncing ? 'Syncing…' : 'Sync'}</span>
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main">
        <div className="sidebar-brand">Ledger</div>
        <nav>
          {ALL_TABS.map(({ key, label, Icon }) => (
            <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)}>
              <Icon />{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sheet-section" style={{ padding: 0 }} id="side-appearance">Appearance</div>
          <ThemeSwitch theme={theme} onChange={onThemeChange} idPrefix="side" />
          <div className="t-12 muted" style={{ marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</div>
          <button type="button" className="btn btn-quiet btn-sm is-neg" style={{ justifyContent: 'flex-start', padding: 0 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <span className="topbar-brand">Ledger</span>
          <span className="topbar-compact" aria-hidden="true">{activeLabel}</span>
          {syncButton}
        </header>

        <main className="main">
          <div className="page-head">
            <h1 className="t-28 display">{activeLabel}</h1>
            {tab === 'overview' && <span className="t-14 muted">{todayLabel()}</span>}
          </div>
          {loadErr && <ErrorState message={`Couldn't load your household: ${loadErr}`} />}
          {!loadErr && !household && <LoadingState />}
          {household && tab === 'overview' && <Overview householdId={hid} refreshKey={refreshKey} onSelectAccount={goToAccountTransactions} onViewSpending={goToSpendingBreakdown} />}
          {household && tab === 'transactions' && (
            <Transactions
              householdId={hid}
              refreshKey={refreshKey}
              initialAccountFilter={pendingAccountFilter}
              onConsumeInitialFilter={() => setPendingAccountFilter(null)}
              initialBreakdownOpen={pendingBreakdownOpen}
              onConsumeInitialBreakdownOpen={() => setPendingBreakdownOpen(false)}
            />
          )}
          {household && tab === 'upcoming' && <Upcoming householdId={hid} refreshKey={refreshKey} />}
          {household && tab === 'networth' && <NetWorth householdId={hid} refreshKey={refreshKey} />}
          {household && tab === 'reimbursements' && <Reimbursements householdId={hid} refreshKey={refreshKey} />}
          {household && tab === 'allocations' && <Allocations householdId={hid} refreshKey={refreshKey} />}
          {household && tab === 'import' && <Import householdId={hid} refreshKey={refreshKey} />}
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {TAB_BAR.map(({ key, label, Icon }) => (
          <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)}>
            <Icon />{label}
          </button>
        ))}
        <button
          ref={moreBtnRef}
          type="button"
          aria-current={inMore ? 'page' : undefined}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        ><IconGrid />More</button>
      </nav>

      <div className={`scrim${sheetOpen ? ' is-open' : ''}`} onClick={closeSheet} />
      <div ref={sheetRef} className={`sheet${sheetOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="more-title" aria-hidden={!sheetOpen}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="t-20 display" id="more-title">More</h2>
          <button ref={sheetCloseRef} type="button" className="btn-icon" aria-label="Close" onClick={closeSheet}><IconClose /></button>
        </div>
        <div className="sheet-section">Pages</div>
        {MORE_TABS.map(({ key, label, Icon }) => (
          <button key={key} type="button" className="row" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)}>
            <span className="row-icon"><Icon /></span>
            <span className="row-main t-14 semi">{label}</span>
            <span className="row-chev"><IconChevronRight /></span>
          </button>
        ))}
        <div className="sheet-section" id="sheet-appearance">Appearance</div>
        <div style={{ padding: '4px 8px' }}><ThemeSwitch theme={theme} onChange={onThemeChange} idPrefix="sheet" /></div>
        <div className="sheet-section">Account</div>
        <div className="t-12 muted" style={{ padding: '0 8px 4px' }}>{session.user.email}</div>
        <button type="button" className="btn btn-quiet is-neg" style={{ justifyContent: 'flex-start', padding: '0 8px' }} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [theme, setTheme] = useState(getStoredTheme);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    applyTheme(theme);
    return watchSystemTheme(() => themeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  function handleThemeChange(key) {
    setTheme(key);
    applyTheme(key);
    setStoredTheme(key);
  }

  if (session === undefined) {
    return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} className="t-14 muted">Loading…</div>;
  }
  return (
    <ToastProvider>
      {session ? <DashboardScreen session={session} theme={theme} onThemeChange={handleThemeChange} /> : <AuthScreen />}
    </ToastProvider>
  );
}
