import React, { useEffect, useState, useMemo } from 'react';
import { getAccounts, getNetWorthItems, getRecurringRules, getAllTransactions, getTransactionTags, getPlannedTransactions, getBudgets, setBudget, removeBudget, computeLiveBalances } from './lib/queries.js';
import { projectOccurrences, isIncome, todayIso } from './lib/occurrences.js';

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
  card: { background: '#F8F6F0', borderRadius: 8, padding: 20 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7268', marginBottom: 6 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  field: { padding: '5px 8px', border: '1px solid #E3DECF', borderRadius: 4, fontSize: 12, background: '#fff' },
};

export default function Overview({ householdId, onSelectAccount }) {
  const [accounts, setAccounts] = useState(null);
  const [netWorthItems, setNetWorthItems] = useState([]);
  const [rules, setRules] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [tags, setTags] = useState({});
  const [plannedTxns, setPlannedTxns] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);
  const [horizon, setHorizon] = useState('payday');
  const [netWorthCollapsed, setNetWorthCollapsed] = useState(false);
  const [editingBudgetCat, setEditingBudgetCat] = useState(null);
  const [budgetDraft, setBudgetDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, items, r, txns, tagMap, planned, budgetRows] = await Promise.all([
          getAccounts(householdId), getNetWorthItems(householdId), getRecurringRules(householdId),
          getAllTransactions(householdId), getTransactionTags(householdId), getPlannedTransactions(householdId), getBudgets(householdId),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setNetWorthItems(items);
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
      const [accs, items, r, txns, tagMap, planned, budgetRows] = await Promise.all([
        getAccounts(householdId), getNetWorthItems(householdId), getRecurringRules(householdId),
        getAllTransactions(householdId), getTransactionTags(householdId), getPlannedTransactions(householdId), getBudgets(householdId),
      ]);
      setAccounts(accs);
      setNetWorthItems(items);
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

  const outstandingReimbursements = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => (tags[t.id] || []).includes('reimbursable_work') && !(tags[t.id] || []).includes('reimbursed'));
  }, [transactions, tags]);

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

  if (error) return <div style={{ color: '#9C4A34' }}>Couldn't load overview: {error}</div>;
  if (!accounts || !rules || !transactions) return <div style={{ color: '#6B7268' }}>Loading…</div>;

  const accountsNetWorth = accounts.reduce((sum, a) => sum + (balances[a.id] || 0), 0);
  const manualNetWorth = netWorthItems.reduce((sum, i) => sum + (i.type === 'liability' ? -i.value : i.value), 0);
  const netWorth = accountsNetWorth + manualNetWorth;

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 14 }}>
        {netWorthCollapsed ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setNetWorthCollapsed(false)}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={s.label}>Net worth</div>
              <span style={{ ...s.num, fontSize: 18, fontWeight: 600, color: netWorth < 0 ? '#9C4A34' : '#1F4D3D' }}>{fmtCAD(netWorth)}</span>
            </div>
            <span style={{ color: '#6B7268', fontSize: 12 }}>▾</span>
          </div>
        ) : (<>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setNetWorthCollapsed(true)}>
              <div style={s.label}>Net worth</div>
              <span style={{ color: '#6B7268', fontSize: 11, marginTop: -6 }}>▴</span>
            </div>
          </div>
          <div style={{ ...s.num, fontSize: 30, fontWeight: 600, color: netWorth < 0 ? '#9C4A34' : '#1F4D3D' }}>{fmtCAD(netWorth)}</div>
          <div style={{ fontSize: 11, color: '#6B7268', marginTop: 4 }}>all accounts{netWorthItems.length ? ` + ${netWorthItems.length} other item${netWorthItems.length === 1 ? '' : 's'}` : ''}</div>
        </>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={{ ...s.card, background: '#1F4D3D' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(248,246,240,0.75)' }}>
              {horizon === 'payday' ? 'Safe to spend' : 'Projected free cash'}
            </div>
            <select value={horizon} onChange={e => setHorizon(e.target.value)} style={{ ...s.field, background: 'rgba(248,246,240,0.15)', color: '#F8F6F0', border: '1px solid rgba(248,246,240,0.3)' }}>
              <option value="payday" style={{ color: '#000' }}>By next payday</option>
              {horizonMonths.map(ym => <option key={ym} value={ym} style={{ color: '#000' }}>End of {monthLabel(ym)}</option>)}
            </select>
          </div>
          <div style={{ ...s.num, fontSize: 30, fontWeight: 600, color: '#F8F6F0' }}>{fmtCAD(horizon === 'payday' ? safeToSpend : projectedFreeCash)}</div>
          <div style={{ fontSize: 11.5, color: 'rgba(248,246,240,0.75)', marginTop: 6 }}>Committed: <span className="num">{fmtCAD(committedThroughHorizon)}</span></div>
        </div>
        <div style={s.card}>
          <div style={s.label}>Days to payday</div>
          <div style={{ ...s.num, fontSize: 30, fontWeight: 600 }}>{daysToPayday ?? '—'}</div>
          <div style={{ fontSize: 11, color: '#6B7268', marginTop: 4 }}>{nextPayrollDate ? `next payday ${fmtDate(nextPayrollDate)}` : 'no payroll rule found'}</div>
        </div>
        <div style={s.card}>
          <div style={s.label}>Cash on hand</div>
          <div style={{ ...s.num, fontSize: 30, fontWeight: 600, color: cashOnHand < 100 ? '#9C4A34' : '#1F4D3D' }}>{fmtCAD(cashOnHand)}</div>
          <div style={{ fontSize: 11, color: '#6B7268', marginTop: 4 }}>Infinity</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
        {accounts.map(a => (
          <div
            key={a.id}
            onClick={() => onSelectAccount && onSelectAccount(a.id)}
            style={{ ...s.card, padding: 16, cursor: onSelectAccount ? 'pointer' : 'default' }}
            title={onSelectAccount ? `View ${a.name}'s transactions` : undefined}
          >
            <div style={s.label}>{a.name}</div>
            <div style={{ ...s.num, fontSize: 20, fontWeight: 600, color: (balances[a.id] || 0) < 0 ? '#9C4A34' : '#1B211D' }}>{fmtCAD(balances[a.id])}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={s.card}>
          <div style={s.label}>Spending by category · {monthLabel(thisMonthYm)}</div>
          {categorySpend.length === 0 && <div style={{ fontSize: 13, color: '#6B7268' }}>Nothing this month.</div>}
          {categorySpend.map(([cat, amt]) => {
            const budget = budgetByCategory[cat];
            const overBudget = budget != null && amt > budget;
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 3, gap: 6 }}>
                  <span>{cat}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ ...s.num, fontWeight: 600, color: overBudget ? '#9C4A34' : '#1B211D' }}>
                      {fmtCAD(amt)}{budget != null ? ` / ${fmtCAD(budget)}` : ''}
                    </span>
                    {editingBudgetCat !== cat && (
                      <button style={{ background: 'none', border: 'none', color: '#6B7268', fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => startEditBudget(cat, budget)}>
                        {budget != null ? 'edit' : 'set budget'}
                      </button>
                    )}
                  </span>
                </div>
                {editingBudgetCat === cat ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <input style={{ ...s.field, width: 90 }} type="number" value={budgetDraft} onChange={e => setBudgetDraft(e.target.value)} autoFocus placeholder="$ limit" />
                    <button style={{ background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} onClick={() => saveBudgetFor(cat)}>Save</button>
                    {budget != null && <button style={{ background: 'none', border: '1px solid #E3DECF', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => clearBudgetFor(cat)}>Remove</button>}
                    <button style={{ background: 'none', border: 'none', color: '#6B7268', fontSize: 11, cursor: 'pointer' }} onClick={() => setEditingBudgetCat(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ height: 5, background: '#E3DECF', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((amt / (budget || maxCategorySpend)) * 100, 100)}%`, background: overBudget ? '#9C4A34' : '#1F4D3D' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={s.card}>
          <div style={s.label}>Outstanding reimbursements</div>
          {outstandingReimbursements.length === 0 && <div style={{ fontSize: 13, color: '#6B7268' }}>Nothing outstanding.</div>}
          {outstandingReimbursements.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E3DECF', fontSize: 12.5 }}>
              <span>{t.raw_description}</span>
              <span style={{ ...s.num, color: '#B8894A', fontWeight: 600 }}>{fmtCAD(Math.abs(t.amount))}</span>
            </div>
          ))}
          {outstandingReimbursements.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>
              Total owed to you: <span style={s.num}>{fmtCAD(outstandingReimbursements.reduce((sum, t) => sum + Math.abs(t.amount), 0))}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
