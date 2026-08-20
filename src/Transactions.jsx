import React, { useEffect, useState, useMemo } from 'react';
import { getAccounts, getAllTransactions } from './lib/queries.js';

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '−' : '+';
  return sign + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const s = {
  card: { background: '#F8F6F0', borderRadius: 8 },
  field: { padding: '7px 10px', border: '1px solid #E3DECF', borderRadius: 4, fontSize: 13, background: '#fff' },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
};

export default function Transactions({ householdId }) {
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [showTransfers, setShowTransfers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, txns] = await Promise.all([getAccounts(householdId), getAllTransactions(householdId)]);
        if (cancelled) return;
        setAccounts(accs);
        setTransactions(txns);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [householdId]);

  const accountsById = useMemo(() => {
    const map = {};
    (accounts || []).forEach(a => { map[a.id] = a; });
    return map;
  }, [accounts]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter(t => accountFilter === 'all' || t.account_id === accountFilter)
      .filter(t => showTransfers || !t.is_transfer)
      .filter(t => !q || t.raw_description.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [transactions, accountFilter, showTransfers, q]);

  if (error) return <div style={{ color: '#9C4A34' }}>Couldn't load transactions: {error}</div>;
  if (!transactions || !accounts) return <div style={{ color: '#6B7268' }}>Loading transactions…</div>;

  return (
    <div style={s.card}>
      <div style={{ padding: 16, borderBottom: '1px solid #E3DECF', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...s.field, flex: '1 1 200px' }} placeholder="Search description…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={s.field} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, color: '#6B7268' }}>
          <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)} />
          Show internal transfers
        </label>
        <div style={{ fontSize: 12, color: '#6B7268', marginLeft: 'auto' }}>{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</div>
      </div>
      <div>
        {filtered.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #E3DECF', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>{t.raw_description}</div>
              <div style={{ fontSize: 11, color: '#6B7268', marginTop: 2 }}>
                {fmtDate(t.date)} · {accountsById[t.account_id]?.name} · {t.category}
                {t.needs_review && <span style={{ color: '#9C4A34', marginLeft: 6 }}>· unmatched transfer</span>}
              </div>
            </div>
            <div style={{ ...s.num, fontSize: 14, fontWeight: 600, color: t.amount < 0 ? '#1B211D' : '#1F4D3D', flexShrink: 0 }}>
              {fmtCAD(t.amount)}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: 24, fontSize: 13, color: '#6B7268' }}>No transactions match.</div>}
      </div>
    </div>
  );
}
