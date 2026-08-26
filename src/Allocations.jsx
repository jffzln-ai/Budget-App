import React, { useEffect, useState } from 'react';
import { getAccounts, getAllTransactions, computeLiveBalances } from './lib/queries.js';

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const s = {
  card: { background: 'var(--card)', borderRadius: 20, padding: 22, boxShadow: '0 1px 3px rgba(27,33,29,0.04)' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 8 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  field: { padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: 'var(--card)' },
};

function ymKey(date) { return date.slice(0, 7); }
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

export default function Allocations({ householdId }) {
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState(null);
  const [month, setMonth] = useState('all');

  async function load() {
    try {
      const [accs, txns] = await Promise.all([getAccounts(householdId), getAllTransactions(householdId)]);
      setAccounts(accs);
      setTransactions(txns);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [householdId]);

  if (error) return <div style={{ color: 'var(--rust)' }}>{error}</div>;
  if (!accounts || !transactions) return <div style={{ color: 'var(--ink-soft)' }}>Loading…</div>;

  const savingsAccounts = accounts.filter(a => a.type === 'savings');
  const tfsa = accounts.find(a => a.type === 'investment');
  const balances = computeLiveBalances(accounts);

  const savingsIds = new Set(savingsAccounts.map(a => a.id));
  const availableMonths = Array.from(new Set(transactions.filter(t => savingsIds.has(t.account_id)).map(t => ymKey(t.date)))).sort().reverse();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <select style={s.field} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {availableMonths.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {savingsAccounts.map(a => {
          const accTxns = transactions
            .filter(t => t.account_id === a.id)
            .filter(t => month === 'all' || ymKey(t.date) === month)
            .sort((x, y) => y.date.localeCompare(x.date));
          const balance = balances[a.id];
          const inflow = accTxns.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
          const outflow = Math.abs(accTxns.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));
          return (
            <div key={a.id} style={s.card}>
              <div style={s.label}>{a.name}{a.purpose === 'rental' ? ' · Rental' : ''}</div>
              <div style={{ ...s.num, fontSize: 24, fontWeight: 700, color: 'var(--pine)' }}>{fmtCAD(balance)}</div>
              {month !== 'all' && <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 2 }}>current balance · activity below is {monthLabel(month)} only</div>}
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
                <span>In: <span style={{ ...s.num, color: 'var(--pine)' }}>{fmtCAD(inflow)}</span></span>
                <span>Out: <span style={{ ...s.num, color: 'var(--rust)' }}>{fmtCAD(outflow)}</span></span>
              </div>
              <div style={{ marginTop: 10 }}>
                {accTxns.slice(0, month === 'all' ? 4 : 12).map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 0', borderTop: '1px solid var(--line-soft)' }}>
                    <span style={{ color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{t.raw_description}</span>
                    <span style={{ ...s.num, fontWeight: 600, color: t.amount < 0 ? 'var(--ink)' : 'var(--pine)' }}>{t.amount < 0 ? '−' : '+'}{fmtCAD(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {tfsa && (
          <div style={s.card}>
            <div style={s.label}>{tfsa.name}</div>
            <div style={{ ...s.num, fontSize: 24, fontWeight: 700, color: 'var(--pine)' }}>{fmtCAD(tfsa.current_balance)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 8, lineHeight: 1.5 }}>Holdings snapshot only.</div>
          </div>
        )}
      </div>
    </div>
  );
}
