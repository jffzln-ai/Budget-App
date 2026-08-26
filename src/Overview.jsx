import React, { useEffect, useState, useMemo } from 'react';
import { getAccounts, getRecurringRules, getAllTransactions, getTransactionTags, getPlannedTransactions, getBudgets, setBudget, removeBudget, computeLiveBalances } from './lib/queries.js';
import { projectOccurrences, isIncome, todayIso } from './lib/occurrences.js';
import { ProgressRing } from './lib/icons.jsx';

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '−' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long' });
}
function endOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}
function nextMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

const s = {
  card: { background: 'var(--card)', borderRadius: 20, padding: 22, boxShadow: '0 1px 3px rgba(27,33,29,0.04)' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 6 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  field: { padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, background: 'var(--card)' },
};
const RUST = 'var(--rust)';
const PINE = 'var(--pine)';
const PINE_SOFT = 'var(--pine-soft)';

export default function Overview({ householdId, onSelectAccount }) {
  const [accounts, setAccounts] = useState(null);
  const [rules, setRules] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [tags, setTags] = useState({});
  const [plannedTxns, setPlannedTxns] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);
  const [horizon, setHorizon] = useState('payday');
  const [editingBudgetCat, setEditingBudgetCat] = useState(null);
  const [budgetDraft, setBudgetDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, r, txns, tagMap, planned, budgetRows] = await Promise.all([
          getAccounts(householdId), getRecurringRules(householdId),
          getAllTransactions(householdId), getTransactionTags(householdId), getPlannedTransactions(householdId), getBudgets(householdId),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setRules(r);
        setTransactions(txns);
        setTags(tagMap);
        setPlannedTxns(planned);
        setBudgets(budgetRows);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [householdId]);

  async function reload() {
    try {
      const [accs, r, txns, tagMap, planned, budgetRows] = await Promise.all([
        getAccounts(householdId), getRecurringRules(householdId),
        getAllTransactions(householdId), getTransactionTags(householdId), getPlannedTransactions(householdId), getBudgets(householdId),
      ]);
      setAccounts(accs);
      setRules(r);
      setTransactions(txns);
      setTags(tagMap);
      setPlannedTxns(planned);
      setBudgets(budgetRows);
    } catch (err) {
      setError(err.message);
    }
  }

  const today = todayIso();
  const horizonMonths = useMemo(() => nextMonths(3), []);

  const balances = useMemo(() => (accounts ? computeLiveBalances(accounts) : {}), [accounts]);
  const infinity = accounts ? accounts.find(a => a.name === 'Infinity') : null;
  const cashOnHand = infinity ? balances[infinity.id] : 0;

  const occurrences = useMemo(() => {
    const fromRules = rules ? projectOccurrences(rules) : [];
    const fromPlanned = plannedTxns.map(p => ({
      occId: p.id,
      rule: {
        id: p.id, account_id: p.account_id, label: p.description, category: 'Planned', cadence: 'once',
        expected_amount: Math.abs(p.amount), status: 'active', planned: true, is_income: p.amount > 0,
      },
      date: p.date,
    }));
    return [...fromRules, ...fromPlanned];
  }, [rules, plannedTxns]);

  const infinityFutureOcc = useMemo(() => {
    if (!infinity) return [];
    return occurrences.filter(o =>
      o.rule.account_id === infinity.id &&
      o.date > today &&
      o.rule.status !== 'needs_confirmation' &&
      !(o.rule.skipped_dates || []).includes(o.date)
    );
  }, [occurrences, infinity, today]);

  const nextPayrollOcc = infinityFutureOcc.filter(o => isIncome(o.rule)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextPayrollDate = nextPayrollOcc ? nextPayrollOcc.date : null;
  const daysToPayday = nextPayrollDate ? Math.round((new Date(nextPayrollDate) - new Date(today)) / 86400000) : null;

  const horizonEndDate = horizon === 'payday' ? nextPayrollDate : endOfMonth(horizon);

  const committedThroughHorizon = useMemo(() => {
    if (!horizonEndDate) return 0;
    return infinityFutureOcc
      .filter(o => !isIncome(o.rule) && o.date <= horizonEndDate)
      .reduce((sum, o) => sum + o.rule.expected_amount, 0);
  }, [infinityFutureOcc, horizonEndDate]);

  const incomeThroughHorizon = useMemo(() => {
    if (!horizonEndDate) return 0;
    return infinityFutureOcc
      .filter(o => isIncome(o.rule) && o.date <= horizonEndDate)
      .reduce((sum, o) => sum + o.rule.expected_amount, 0);
  }, [infinityFutureOcc, horizonEndDate]);

  const safeToSpend = cashOnHand - committedThroughHorizon;
  const projectedFreeCash = cashOnHand + incomeThroughHorizon - committedThroughHorizon;

  const thisMonthYm = today.slice(0, 7);
  const categorySpend = useMemo(() => {
    if (!transactions) return [];
    const totals = {};
    transactions.forEach(t => {
      if (t.is_transfer || t.amount >= 0) return;
      if ((tags[t.id] || []).includes('reimbursable_work')) return;
      if (t.date.slice(0, 7) !== thisMonthYm) return;
      totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [transactions, tags, thisMonthYm]);
  const maxCategorySpend = categorySpend.length ? categorySpend[0][1] : 1;

  const budgetByCategory = useMemo(() => {
    const map = {};
    budgets.forEach(b => { map[b.category] = b.monthly_limit; });
    return map;
  }, [budgets]);

  function startEditBudget(cat, current) {
    setEditingBudgetCat(cat);
    setBudgetDraft(current != null ? String(current) : '');
  }

  async function saveBudgetFor(cat) {
    const val = parseFloat(budgetDraft);
    if (Number.isNaN(val) || val < 0) return;
    try {
      await setBudget(householdId, cat, val);
      setEditingBudgetCat(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearBudgetFor(cat) {
    try {
      await removeBudget(householdId, cat);
      setEditingBudgetCat(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div style={{ color: 'var(--rust)' }}>Couldn't load overview: {error}</div>;
  if (!accounts || !rules || !transactions) return <div style={{ color: 'var(--ink-soft)' }}>Loading…</div>;

  const heroValue = horizon === 'payday' ? safeToSpend : projectedFreeCash;
  const heroMax = horizon === 'payday' ? cashOnHand : (cashOnHand + incomeThroughHorizon);
  const heroColor = heroValue < 0 ? RUST : PINE;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div style={s.label}>{horizon === 'payday' ? 'Safe to spend' : 'Projected free cash'}</div>
            <select value={horizon} onChange={e => setHorizon(e.target.value)} style={s.field}>
              <option value="payday">By next payday</option>
              {horizonMonths.map(ym => <option key={ym} value={ym}>End of {monthLabel(ym)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6 }}>
            <ProgressRing value={heroValue} max={heroMax} size={104} strokeWidth={10} color={heroColor} trackColor={PINE_SOFT}>
              <div style={{ ...s.num, fontSize: 12, fontWeight: 700, color: heroColor, textAlign: 'center', lineHeight: 1.2 }}>
                {fmtCAD(heroValue)}
              </div>
            </ProgressRing>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                out of <span style={{ ...s.num, fontWeight: 600, color: 'var(--ink)' }}>{fmtCAD(heroMax)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                Committed: <span style={{ ...s.num, fontWeight: 600, color: 'var(--ink)' }}>{fmtCAD(committedThroughHorizon)}</span>
              </div>
            </div>
          </div>
        </div>
        <div style={s.card}>
          <div style={s.label}>Days to payday</div>
          <div style={{ ...s.num, fontSize: 32, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{daysToPayday ?? '—'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>{nextPayrollDate ? `next payday ${fmtDate(nextPayrollDate)}` : 'no payroll rule found'}</div>
        </div>
        <div style={s.card}>
          <div style={s.label}>Cash on hand</div>
          <div style={{ ...s.num, fontSize: 32, fontWeight: 700, color: cashOnHand < 100 ? RUST : PINE, marginTop: 4 }}>{fmtCAD(cashOnHand)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>Infinity</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
        {accounts.map(a => (
          <div
            key={a.id}
            onClick={() => onSelectAccount && onSelectAccount(a.id)}
            style={{ ...s.card, padding: 18, cursor: onSelectAccount ? 'pointer' : 'default' }}
            title={onSelectAccount ? `View ${a.name}'s transactions` : undefined}
          >
            <div style={s.label}>{a.name}</div>
            <div style={{ ...s.num, fontSize: 21, fontWeight: 700, color: (balances[a.id] || 0) < 0 ? RUST : 'var(--ink)' }}>{fmtCAD(balances[a.id])}</div>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={s.label}>Spending by category · {monthLabel(thisMonthYm)}</div>
          {categorySpend.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>Nothing this month.</div>}
          {categorySpend.map(([cat, amt]) => {
            const budget = budgetByCategory[cat];
            const overBudget = budget != null && amt > budget;
            return (
              <div key={cat} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 4, gap: 6 }}>
                  <span style={{ fontWeight: 500 }}>{cat}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ ...s.num, fontWeight: 700, color: overBudget ? RUST : 'var(--ink)' }}>
                      {fmtCAD(amt)}{budget != null ? ` / ${fmtCAD(budget)}` : ''}
                    </span>
                    {editingBudgetCat !== cat && (
                      <button style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => startEditBudget(cat, budget)}>
                        {budget != null ? 'edit' : 'set budget'}
                      </button>
                    )}
                  </span>
                </div>
                {editingBudgetCat === cat ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <input style={{ ...s.field, width: 90 }} type="number" value={budgetDraft} onChange={e => setBudgetDraft(e.target.value)} autoFocus placeholder="$ limit" />
                    <button style={{ background: PINE, color: 'var(--hero-text)', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} onClick={() => saveBudgetFor(cat)}>Save</button>
                    {budget != null && <button style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }} onClick={() => clearBudgetFor(cat)}>Remove</button>}
                    <button style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 11, cursor: 'pointer' }} onClick={() => setEditingBudgetCat(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ height: 7, background: PINE_SOFT, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((amt / (budget || maxCategorySpend)) * 100, 100)}%`, background: overBudget ? RUST : PINE, borderRadius: 6 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}
