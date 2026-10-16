import React, { useEffect, useState, useMemo } from 'react';
import {
  getAccounts, getAllTransactions, getCustomCategories,
  updateTransaction, setCategoryRule, applyCategoryToIds,
} from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';
import { useToast } from './lib/toast.jsx';
import { fmtCAD } from './lib/accounts.jsx';
import { IconChevronRight } from './lib/icons.jsx';
import { ruleKey, isETransfer } from './lib/ruleKey.js';

function fmtSigned(n) {
  const sign = n < 0 ? '−' : '+';
  return sign + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}
const isUncategorized = t => t.category === 'Uncategorized' && !t.is_transfer;

// One uncategorized transaction at a time. Saving a category can also store a
// rule for the exact description and apply it to the other uncategorized
// transactions that share it (same mechanism as "Apply to all" on Transactions).
export default function Review({ householdId, refreshKey = 0, onBack }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [error, setError] = useState(null);
  const [queue, setQueue] = useState([]);
  const [reviewed, setReviewed] = useState(0);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, txns, customCats] = await Promise.all([
          getAccounts(householdId), getAllTransactions(householdId), getCustomCategories(householdId),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setTransactions(txns);
        setCustomCategories(customCats);
        // Keep the current order on reloads; newly synced items go to the back.
        const newest = txns.filter(isUncategorized).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map(t => t.id);
        setQueue(prev => {
          const still = new Set(newest);
          const kept = prev.filter(id => still.has(id));
          const keptSet = new Set(kept);
          return [...kept, ...newest.filter(id => !keptSet.has(id))];
        });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [householdId, refreshKey]);

  const byId = useMemo(() => {
    const map = {};
    (transactions || []).forEach(t => { map[t.id] = t; });
    return map;
  }, [transactions]);
  const accountsById = useMemo(() => {
    const map = {};
    (accounts || []).forEach(a => { map[a.id] = a; });
    return map;
  }, [accounts]);

  const knownCategories = useMemo(() => {
    const names = new Set(customCategories.map(c => c.name));
    (transactions || []).forEach(t => { if (!t.is_transfer && t.category && t.category !== 'Uncategorized') names.add(t.category); });
    return Array.from(names).sort();
  }, [transactions, customCategories]);

  // Most-used categories, separately for money out and money in.
  const topByDirection = useMemo(() => {
    const out = {}, inn = {};
    (transactions || []).forEach(t => {
      if (t.is_transfer || !t.category || t.category === 'Uncategorized') return;
      const bucket = t.amount < 0 ? out : inn;
      bucket[t.category] = (bucket[t.category] || 0) + 1;
    });
    const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
    return { out: top(out), inn: top(inn) };
  }, [transactions]);

  const current = queue.length && transactions ? byId[queue[0]] : null;
  const upNext = queue.slice(1, 3).map(id => byId[id]).filter(Boolean);
  const matchIds = useMemo(() => {
    if (!current || !transactions) return [];
    const key = ruleKey(current.raw_description, current.amount);
    return transactions.filter(t => t.id !== current.id && isUncategorized(t) && ruleKey(t.raw_description, t.amount) === key).map(t => t.id);
  }, [current, transactions]);
  const currentKey = current ? ruleKey(current.raw_description, current.amount) : '';
  const currentIsETransfer = current ? isETransfer(current.raw_description) : false;
  const leftToCategorize = useMemo(
    () => queue.reduce((sum, id) => (byId[id] && byId[id].amount < 0 ? sum + Math.abs(byId[id].amount) : sum), 0),
    [queue, byId],
  );

  async function choose(category) {
    if (!current || busy) return;
    setBusy(true);
    try {
      await updateTransaction(current.id, { category });
      let affected = [current.id];
      if (remember) {
        await setCategoryRule(householdId, currentKey, category);
        await applyCategoryToIds(matchIds, category);
        affected = [current.id, ...matchIds];
      }
      const done = new Set(affected);
      setTransactions(prev => prev.map(t => (done.has(t.id) ? { ...t, category } : t)));
      setQueue(q => q.filter(id => !done.has(id)));
      setReviewed(n => n + affected.length);
    } catch (err) {
      toast(`Couldn't save that change: ${err.message}`, { error: true });
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    setQueue(q => (q.length > 1 ? [...q.slice(1), q[0]] : q));
  }

  if (error && !transactions) return <ErrorState message={`Couldn't load the review queue: ${error}`} />;
  if (!transactions || !accounts) return <LoadingState label="Loading the review queue…" />;

  const total = reviewed + queue.length;
  const chips = current ? (current.amount < 0 ? topByDirection.out : topByDirection.inn).filter(c => knownCategories.includes(c)) : [];

  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-quiet review-back" onClick={onBack}>
          <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><IconChevronRight /></span>Overview
        </button>
      </div>

      {!current ? (
        <section className="card" role="status">
          <h2 className="t-16 semi" style={{ margin: 0 }}>All caught up</h2>
          <div className="t-14 muted">
            {reviewed > 0 ? `You categorized ${reviewed} transaction${reviewed === 1 ? '' : 's'}.` : 'Nothing is waiting for a category.'}
          </div>
          <div className="toolbar"><button type="button" className="btn btn-primary" onClick={onBack}>Back to Overview</button></div>
        </section>
      ) : (
        <>
          <div>
            <div className="t-14 muted">{reviewed + 1} of {total} · {fmtCAD(leftToCategorize)} left to categorize</div>
            <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={reviewed}>
              <i style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }} />
            </div>
          </div>

          <section className="card review-card" aria-label="Transaction to categorize">
            <div className="t-12 muted">{fmtDay(current.date)} · {accountsById[current.account_id]?.name || 'Account'}</div>
            <div className="t-20 semi review-desc">{current.raw_description}</div>
            <div className={`review-amt display${current.amount > 0 ? ' pos' : ''}`}>{fmtSigned(current.amount)}</div>
            {currentIsETransfer && <div className="t-12 muted">Interac e-transfer. The bank doesn't say who it was {current.amount < 0 ? 'to' : 'from'}, so the rule matches on the amount.</div>}

            <div className="t-12 caps muted" id="review-cat-label" style={{ marginTop: 8 }}>Category</div>
            <div className="review-chips" role="group" aria-labelledby="review-cat-label">
              {chips.map(c => (
                <button key={c} type="button" className="btn btn-secondary review-pick" disabled={busy} onClick={() => choose(c)}>{c}</button>
              ))}
              <label className="review-select">
                <span className="sr-only">Choose from all categories</span>
                <select className="input" disabled={busy} value="" onChange={e => { if (e.target.value) choose(e.target.value); }}>
                  <option value="">All categories…</option>
                  {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label className="check review-remember">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span>
                {currentIsETransfer
                  ? (matchIds.length > 0
                    ? `Also apply to ${matchIds.length} other e-transfer${matchIds.length === 1 ? '' : 's'} of ${fmtCAD(Math.abs(current.amount))}, and future ones`
                    : `Remember e-transfers of ${fmtCAD(Math.abs(current.amount))} ${current.amount < 0 ? 'out' : 'in'} for future imports`)
                  : (matchIds.length > 0
                    ? `Also apply to ${matchIds.length} other “${current.raw_description}” transaction${matchIds.length === 1 ? '' : 's'}, and future ones`
                    : `Remember “${current.raw_description}” for future imports`)}
              </span>
            </label>
          </section>

          <div className="toolbar">
            <button type="button" className="btn btn-secondary review-skip" disabled={busy || queue.length < 2} onClick={skip}>Skip for now</button>
          </div>

          {upNext.length > 0 && (
            <section aria-labelledby="review-next-h" className="day-group">
              <div className="day-label t-12 caps" id="review-next-h">Up next</div>
              <div className="list-card">
                {upNext.map(t => (
                  <div key={t.id} className="txn">
                    <div className="txn-line">
                      <div className="txn-main">
                        <span className="txn-desc t-14">{t.raw_description}</span>
                        <span className="t-12 muted">{fmtDay(t.date)} · {accountsById[t.account_id]?.name}</span>
                      </div>
                      <span className={`txn-amt t-14${t.amount > 0 ? ' pos' : ''}`}>{fmtSigned(t.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
