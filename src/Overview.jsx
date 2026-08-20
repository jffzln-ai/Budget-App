import React, { useEffect, useState } from 'react';
import { getAccounts, getAllTransactions, computeLiveBalances } from './lib/queries.js';

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '−' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const s = {
  card: { background: '#F8F6F0', borderRadius: 8, padding: 20 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7268', marginBottom: 6 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
};

export default function Overview({ householdId }) {
  const [accounts, setAccounts] = useState(null);
  const [balances, setBalances] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, txns] = await Promise.all([getAccounts(householdId), getAllTransactions(householdId)]);
        if (cancelled) return;
        setAccounts(accs);
        setBalances(computeLiveBalances(accs, txns));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [householdId]);

  if (error) return <div style={{ color: '#9C4A34' }}>Couldn't load accounts: {error}</div>;
  if (!accounts) return <div style={{ color: '#6B7268' }}>Loading accounts…</div>;

  const netWorth = accounts.reduce((sum, a) => sum + (balances[a.id] || 0), 0);

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.label}>Net worth</div>
        <div style={{ ...s.num, fontSize: 30, fontWeight: 600, color: netWorth < 0 ? '#9C4A34' : '#1F4D3D' }}>{fmtCAD(netWorth)}</div>
        <div style={{ fontSize: 11, color: '#6B7268', marginTop: 4 }}>all accounts</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {accounts.map(a => (
          <div key={a.id} style={s.card}>
            <div style={s.label}>{a.name}</div>
            <div style={{ ...s.num, fontSize: 20, fontWeight: 600, color: (balances[a.id] || 0) < 0 ? '#9C4A34' : '#1B211D' }}>
              {fmtCAD(balances[a.id])}
            </div>
            <div style={{ fontSize: 11, color: '#6B7268', marginTop: 4, textTransform: 'capitalize' }}>{a.type.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
