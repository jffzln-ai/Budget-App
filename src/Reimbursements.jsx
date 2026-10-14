import React, { useEffect, useState, useMemo } from 'react';
import { getAllTransactions, getTransactionTags, addTransactionTag, removeTransactionTag } from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const s = {
  card: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 6, padding: 20, boxShadow: 'var(--e1)' },
  label: { fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 8 },
  num: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
  btn: { background: 'var(--brand-primary)', color: 'var(--on-brand)', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
};
const GOLD = 'var(--gold)';

export default function Reimbursements({ householdId, refreshKey = 0 }) {
  const [transactions, setTransactions] = useState(null);
  const [tags, setTags] = useState({});
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const [txns, tagMap] = await Promise.all([getAllTransactions(householdId), getTransactionTags(householdId)]);
      setTransactions(txns);
      setTags(tagMap);
    } catch (err) {
      setError(err.message);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [householdId, refreshKey]);

  const outstanding = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter(t => (tags[t.id] || []).includes('reimbursable_work') && !(tags[t.id] || []).includes('reimbursed'))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, tags]);

  const paid = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter(t => (tags[t.id] || []).includes('reimbursable_work') && (tags[t.id] || []).includes('reimbursed'))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, tags]);

  async function markReimbursed(t) {
    setBusyId(t.id);
    try {
      await addTransactionTag(t.id, 'reimbursed');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function undoReimbursed(t) {
    setBusyId(t.id);
    try {
      await removeTransactionTag(t.id, 'reimbursed');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!transactions) return <LoadingState />;

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 14 }}>
        <div style={s.label}>Outstanding</div>
        {outstanding.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>Nothing outstanding right now.</div>}
        {outstanding.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{t.raw_description}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtDate(t.date)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...s.num, color: GOLD, fontWeight: 700 }}>{fmtCAD(Math.abs(t.amount))}</span>
              <button style={s.btn} disabled={busyId === t.id} onClick={() => markReimbursed(t)}>{busyId === t.id ? '…' : 'Mark paid'}</button>
            </div>
          </div>
        ))}
        {outstanding.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
            Total owed to you: <span style={s.num}>{fmtCAD(outstanding.reduce((sum, t) => sum + Math.abs(t.amount), 0))}</span>
          </div>
        )}
      </div>

      {paid.length > 0 && (
        <div style={s.card}>
          <div style={s.label}>Already reimbursed</div>
          {paid.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
              <div>
                <span>{t.raw_description}</span>
                <span style={{ color: 'var(--ink-soft)', marginLeft: 8 }}>{fmtDate(t.date)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...s.num, fontWeight: 600 }}>{fmtCAD(Math.abs(t.amount))}</span>
                <button onClick={() => undoReimbursed(t)} disabled={busyId === t.id} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Undo</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
