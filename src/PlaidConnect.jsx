import React, { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { getAccounts } from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';
import { createLinkToken, exchangePublicToken, getConnections, mapAccount, syncItem } from './lib/plaidApi.js';

function fmtDateTime(iso) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const s = {
  card: { background: 'var(--card)', borderRadius: 20, padding: 22, maxWidth: 560, marginTop: 20, boxShadow: '0 1px 3px rgba(27,33,29,0.04)' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 8 },
  field: { padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: 'var(--card)' },
  btn: { background: 'var(--pine)', color: 'var(--hero-text)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  ghostBtn: { background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' },
};

// OAuth institutions (most major banks) take the user completely off this
// page to their bank's real login, then back. That's a full page
// navigation, not a React transition - all component state is gone when
// they return. The only way to resume Link afterward is to have stashed
// the original token somewhere that survives a navigation, hence localStorage.
const LINK_TOKEN_STORAGE_KEY = 'plaid_pending_link_token';

// Fires Plaid Link the moment it's ready. Rendered only while a link_token
// is pending, then unmounted - react-plaid-link tears down its own UI on
// unmount, so this doubles as cleanup.
function LinkLauncher({ linkToken, isOAuthResume, onExchanged, onError }) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: isOAuthResume ? window.location.href : undefined,
    onSuccess: async (public_token) => {
      try {
        localStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
        const result = await exchangePublicToken(public_token);
        onExchanged(result);
      } catch (err) {
        onError(err.message);
      }
    },
    onExit: (err) => {
      localStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
      if (err) onError(err.display_message || err.error_message || 'Connection cancelled');
    },
  });

  useEffect(() => { if (ready) open(); }, [ready, open]);
  return null;
}

export default function PlaidConnect({ householdId }) {
  const [connections, setConnections] = useState(null);
  const [ledgerAccounts, setLedgerAccounts] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [isOAuthResume, setIsOAuthResume] = useState(false);
  const [pendingMapping, setPendingMapping] = useState(null); // { plaid_item_id, institution_name, accounts }
  const [mappingChoices, setMappingChoices] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  async function load() {
    try {
      const [conns, accs] = await Promise.all([getConnections(), getAccounts(householdId)]);
      setConnections(conns.connections);
      setLedgerAccounts(accs);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // Landing back here with ?oauth_state_id=... in the URL means we're
    // returning from a bank's OAuth login - resume with the token stashed
    // before the redirect, rather than starting a new Link session.
    const params = new URLSearchParams(window.location.search);
    if (params.has('oauth_state_id')) {
      const stored = localStorage.getItem(LINK_TOKEN_STORAGE_KEY);
      if (stored) {
        setLinkToken(stored);
        setIsOAuthResume(true);
      }
    }
  }, [householdId]);

  async function handleConnectBank() {
    setError(null);
    setBusy(true);
    try {
      const { link_token } = await createLinkToken();
      localStorage.setItem(LINK_TOKEN_STORAGE_KEY, link_token);
      setIsOAuthResume(false);
      setLinkToken(link_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleExchanged(result) {
    setLinkToken(null);
    if (isOAuthResume) {
      window.history.replaceState({}, '', window.location.pathname);
      setIsOAuthResume(false);
    }
    setPendingMapping(result);
    const initialChoices = {};
    result.accounts.forEach(a => { initialChoices[a.plaid_account_id] = { mode: 'new' }; });
    setMappingChoices(initialChoices);
  }

  async function confirmMapping() {
    setBusy(true);
    setError(null);
    try {
      for (const a of pendingMapping.accounts) {
        const choice = mappingChoices[a.plaid_account_id];
        if (choice.mode === 'existing') {
          await mapAccount({ plaid_item_id: pendingMapping.plaid_item_id, plaid_account_id: a.plaid_account_id, existing_account_id: choice.accountId });
        } else {
          await mapAccount({
            plaid_item_id: pendingMapping.plaid_item_id, plaid_account_id: a.plaid_account_id,
            new_account: { name: a.name, plaid_type: a.type, plaid_subtype: a.subtype, institution: pendingMapping.institution_name, current_balance: a.current_balance },
          });
        }
      }
      const itemId = pendingMapping.plaid_item_id;
      setPendingMapping(null);
      await load();
      await handleSync(itemId); // pull in transactions right away rather than leaving a connection with nothing in it
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync(connId) {
    setBusy(true);
    setSyncMsg(null);
    setError(null);
    try {
      const result = await syncItem(connId);
      const parts = [`${result.added} new transaction${result.added === 1 ? '' : 's'}`];
      if (result.transferMatches) parts.push(`${result.transferMatches} transfer pair${result.transferMatches === 1 ? '' : 's'} matched`);
      if (result.newRecurringPatterns) parts.push(`${result.newRecurringPatterns} new recurring pattern${result.newRecurringPatterns === 1 ? '' : 's'} found`);
      setSyncMsg(parts.join(', ') + '.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !connections) return <ErrorState message={`Couldn't load bank connections: ${error}`} />;
  if (!connections) return <LoadingState label="Loading bank connections…" />;

  return (
    <div style={s.card}>
      <div style={s.label}>Connected banks</div>
      {error && <div style={{ color: 'var(--rust)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {syncMsg && <div style={{ color: 'var(--pine)', fontSize: 12.5, marginBottom: 10 }}>{syncMsg}</div>}

      {connections.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
          No banks connected yet - CSV import above still works fine on its own, this is optional.
        </div>
      )}
      {connections.map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{c.institution_name || 'Connected bank'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Last synced {fmtDateTime(c.last_synced_at)} · {c.status}</div>
          </div>
          <button style={s.ghostBtn} disabled={busy} onClick={() => handleSync(c.id)}>{busy ? '…' : 'Sync now'}</button>
        </div>
      ))}

      <button style={{ ...s.btn, marginTop: 14 }} disabled={busy} onClick={handleConnectBank}>{busy ? 'Working…' : '+ Connect a bank'}</button>
      {linkToken && <LinkLauncher linkToken={linkToken} isOAuthResume={isOAuthResume} onExchanged={handleExchanged} onError={setError} />}

      {pendingMapping && (
        <div style={{ marginTop: 16, padding: 14, background: 'var(--cream-tint)', border: '1px solid var(--line)', borderRadius: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
            {pendingMapping.institution_name} found {pendingMapping.accounts.length} account{pendingMapping.accounts.length === 1 ? '' : 's'} - match each to an existing account (keeps its history) or create a new one:
          </div>
          {pendingMapping.accounts.map(a => (
            <div key={a.plaid_account_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, minWidth: 160 }}>{a.name}{a.mask ? ` ···${a.mask}` : ''}</span>
              <select
                style={s.field}
                value={mappingChoices[a.plaid_account_id]?.mode === 'existing' ? mappingChoices[a.plaid_account_id].accountId : 'new'}
                onChange={e => {
                  const val = e.target.value;
                  setMappingChoices(prev => ({
                    ...prev,
                    [a.plaid_account_id]: val === 'new' ? { mode: 'new' } : { mode: 'existing', accountId: val },
                  }));
                }}
              >
                <option value="new">Create new account</option>
                {ledgerAccounts.map(la => <option key={la.id} value={la.id}>Map to: {la.name}</option>)}
              </select>
            </div>
          ))}
          <button style={{ ...s.btn, marginTop: 10 }} disabled={busy} onClick={confirmMapping}>{busy ? 'Saving…' : 'Confirm and sync'}</button>
        </div>
      )}
    </div>
  );
}
