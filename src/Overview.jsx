import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getAccounts, getRecurringRules, getAllTransactions, getTransactionTags, getPlannedTransactions, getBudgets, setBudget, removeBudget, computeLiveBalances } from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';
import { projectOccurrences, isIncome, todayIso } from './lib/occurrences.js';
import { useToast } from './lib/toast.jsx';
import { useCountUp } from './lib/useCountUp.js';
import { IconChevronRight, IconChevronDown, IconPencil } from './lib/icons.jsx';
import { AccountRow, Money, fmtCAD, isDebtAccount } from './lib/accounts.jsx';

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long' });
}
function paydayLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
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

function CategoryRow({ cat, amount, budget, maxSpend, editing, onEdit, onCancel, onSave, onRemove, flash }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const editBtnRef = useRef(null);
  const wasEditing = useRef(false);
  const shownAmount = useCountUp(amount);
  const inputId = `budget-${cat.replace(/\W/g, '')}`;

  useEffect(() => {
    if (editing) {
      setDraft(budget != null ? String(budget) : '');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (wasEditing.current) {
      editBtnRef.current?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing, budget]);

  let state = 'none';
  if (budget != null) state = amount > budget ? 'over' : amount >= budget * 0.9 ? 'near' : 'ok';
  const fillClass = state === 'over' ? 'is-neg' : state === 'near' ? 'is-warn' : state === 'none' ? 'is-muted' : '';
  const width = Math.min((amount / (budget || maxSpend || 1)) * 100, 100);

  async function submit(e) {
    e.preventDefault();
    const val = parseFloat(draft);
    if (draft.trim() === '' || Number.isNaN(val) || val < 0) { setError('Enter a monthly amount of $0 or more.'); inputRef.current?.focus(); return; }
    setSaving(true);
    try { await onSave(cat, val); } finally { setSaving(false); }
  }
  async function remove() {
    setSaving(true);
    try { await onRemove(cat); } finally { setSaving(false); }
  }

  return (
    <li className={`cat${flash ? ' flash' : ''}`}>
      <div className="cat-line">
        <span className="cat-name">
          <span className="t-14 semi">{cat}</span>
          {state === 'over' && <span className="chip is-neg">Over by {fmtCAD(amount - budget)}</span>}
          {state === 'near' && <span className="chip is-warn">{fmtCAD(budget - amount)} left</span>}
        </span>
        <span className="cat-amount t-14">
          <b className="semi">{fmtCAD(shownAmount)}</b>
          {budget != null && <span className="muted"> / {fmtCAD(budget)}</span>}
        </span>
        <button
          ref={editBtnRef}
          type="button"
          className="btn-icon"
          onClick={editing ? onCancel : onEdit}
          aria-expanded={editing}
          aria-label={`${budget != null ? 'Edit' : 'Set'} budget for ${cat}`}
        ><IconPencil /></button>
      </div>
      {editing ? (
        <form className="cat-edit" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor={inputId}>Monthly budget for {cat}</label>
          <input
            ref={inputRef}
            id={inputId}
            className="input input-sm"
            type="number"
            inputMode="decimal"
            min="0"
            step="10"
            placeholder="Monthly $"
            value={draft}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-err` : undefined}
            onChange={e => { setDraft(e.target.value); setError(null); }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
          {budget != null && <button type="button" className="btn btn-quiet btn-sm is-neg" onClick={remove} disabled={saving}>Remove</button>}
          {error && <span className="field-error" id={`${inputId}-err`}>{error}</span>}
        </form>
      ) : (
        <div className="bar" aria-hidden="true"><i className={fillClass} style={{ width: `${width}%` }} /></div>
      )}
    </li>
  );
}

// Accounts grouped by kind. Savings and investments start collapsed so the
// large investment balance doesn't crowd out the accounts you spend from.
const ACCOUNT_GROUPS = [
  { key: 'chequing', label: 'Chequing', types: ['chequing'] },
  { key: 'cards', label: 'Cards', types: ['credit_card', 'line_of_credit'], debt: true },
  { key: 'savings', label: 'Savings & investing', types: ['savings', 'investment'], collapsible: true },
];

function AccountGroups({ accounts, balances, onSelectAccount }) {
  const [savingsOpen, setSavingsOpen] = useState(false);
  const known = ACCOUNT_GROUPS.flatMap(g => g.types);
  const groups = ACCOUNT_GROUPS.map(g => ({ ...g, accounts: accounts.filter(a => g.types.includes(a.type)) }));
  const other = accounts.filter(a => !known.includes(a.type));
  if (other.length) groups.push({ key: 'other', label: 'Other', accounts: other });

  return groups.filter(g => g.accounts.length).map(g => {
    const total = g.accounts.reduce((s, a) => s + (balances[a.id] || 0), 0);
    const totalText = g.debt ? (total > 0 ? `${fmtCAD(total)} credit` : total < 0 ? `${fmtCAD(-total)} owed` : fmtCAD(0)) : fmtCAD(total);
    const rows = (
      <ul className="rows is-compact">
        {g.accounts.map(a => <AccountRow key={a.id} account={a} balance={balances[a.id]} onSelect={onSelectAccount} />)}
      </ul>
    );
    if (g.collapsible) {
      return (
        <div key={g.key} className="acct-group">
          <button type="button" className="acct-toggle" aria-expanded={savingsOpen} onClick={() => setSavingsOpen(o => !o)}>
            <span className="t-14 semi">{g.label}</span>
            <span className="acct-toggle-end t-14 semi">{fmtCAD(total)}</span>
            <span className="row-chev" style={{ transform: savingsOpen ? 'rotate(90deg)' : 'none' }}><IconChevronRight /></span>
          </button>
          {savingsOpen && rows}
        </div>
      );
    }
    return (
      <div key={g.key} className="acct-group">
        <div className="acct-group-h t-12 caps muted"><span>{g.label}</span><span>{totalText}</span></div>
        {rows}
      </div>
    );
  });
}

export default function Overview({ householdId, refreshKey = 0, onSelectAccount, onViewSpending, onReview }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [rules, setRules] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [tags, setTags] = useState({});
  const [plannedTxns, setPlannedTxns] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);
  const [horizon, setHorizon] = useState('payday');
  // Count upcoming card charges in safe-to-spend, net of any credit sitting on the card.
  const [includeCards, setIncludeCards] = useState(() => {
    try { return localStorage.getItem('safeToSpendIncludeCards') !== '0'; } catch { return true; }
  });
  function toggleIncludeCards(on) {
    setIncludeCards(on);
    try { localStorage.setItem('safeToSpendIncludeCards', on ? '1' : '0'); } catch { /* per-viewer convenience only */ }
  }
  const [editingBudgetCat, setEditingBudgetCat] = useState(null);
  const [flashCats, setFlashCats] = useState([]);
  const prevCatTotals = useRef(null);

  const load = useCallback(async () => {
    const [accs, r, txns, tagMap, planned, budgetRows] = await Promise.all([
      getAccounts(householdId), getRecurringRules(householdId),
      getAllTransactions(householdId), getTransactionTags(householdId), getPlannedTransactions(householdId), getBudgets(householdId),
    ]);
    return { accs, r, txns, tagMap, planned, budgetRows };
  }, [householdId]);

  // Reloads keep the current numbers on screen and update them in place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { accs, r, txns, tagMap, planned, budgetRows } = await load();
        if (cancelled) return;
        setAccounts(accs);
        setRules(r);
        setTransactions(txns);
        setTags(tagMap);
        setPlannedTxns(planned);
        setBudgets(budgetRows);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [load, refreshKey]);

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

  // Per card (balances are negative = owed, so a positive balance is credit):
  // credit left after the card's upcoming charges is spendable (surplus), and
  // charges beyond the credit will come out of Infinity (uncovered).
  const cardTotals = useMemo(() => {
    let charges = 0, covered = 0, surplus = 0;
    if (!accounts) return { charges, covered, uncovered: 0, surplus };
    accounts.filter(isDebtAccount).forEach(card => {
      const cardCharges = !horizonEndDate ? 0 : occurrences
        .filter(o =>
          o.rule.account_id === card.id &&
          o.date > today && o.date <= horizonEndDate &&
          o.rule.status !== 'needs_confirmation' &&
          !(o.rule.skipped_dates || []).includes(o.date) &&
          !isIncome(o.rule))
        .reduce((sum, o) => sum + o.rule.expected_amount, 0);
      const credit = Math.max(balances[card.id] || 0, 0);
      charges += cardCharges;
      covered += Math.min(cardCharges, credit);
      surplus += Math.max(credit - cardCharges, 0);
    });
    return { charges, covered, uncovered: charges - covered, surplus };
  }, [accounts, occurrences, balances, today, horizonEndDate]);

  const cardCommitted = includeCards ? cardTotals.uncovered : 0;
  const cardSurplus = includeCards ? cardTotals.surplus : 0;
  const committedTotal = committedThroughHorizon + cardCommitted;
  const safeToSpend = cashOnHand - committedTotal + cardSurplus;
  const projectedFreeCash = cashOnHand + incomeThroughHorizon - committedTotal + cardSurplus;

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
  const monthSpendTotal = categorySpend.reduce((s, [, amt]) => s + amt, 0);
  const uncategorizedCount = useMemo(
    () => (transactions || []).filter(t => t.category === 'Uncategorized' && !t.is_transfer).length,
    [transactions],
  );
  const uncategorizedMonthCount = useMemo(
    () => (transactions || []).filter(t => t.category === 'Uncategorized' && !t.is_transfer && t.date.slice(0, 7) === thisMonthYm).length,
    [transactions, thisMonthYm],
  );
  const [reviewCollapsed, setReviewCollapsed] = useState(() => {
    try { return localStorage.getItem('ledger.reviewCollapsed') === '1'; } catch { return false; }
  });
  const toggleReviewCollapsed = () => setReviewCollapsed(c => {
    const next = !c;
    try { localStorage.setItem('ledger.reviewCollapsed', next ? '1' : '0'); } catch { /* storage unavailable */ }
    return next;
  });
  const uncategorizedThisMonth = (categorySpend.find(([cat]) => cat === 'Uncategorized') || [null, 0])[1];
  const uncategorizedShare = monthSpendTotal > 0 ? Math.round((uncategorizedThisMonth / monthSpendTotal) * 100) : 0;
  const netWorth = accounts ? accounts.reduce((s, a) => s + (balances[a.id] || 0), 0) : 0;

  // After a refresh, briefly highlight the categories whose totals moved.
  useEffect(() => {
    const now = Object.fromEntries(categorySpend);
    const before = prevCatTotals.current;
    prevCatTotals.current = now;
    if (!before) return;
    const changed = Object.keys(now).filter(k => before[k] !== now[k]);
    if (!changed.length) return;
    setFlashCats(changed);
    const t = setTimeout(() => setFlashCats([]), 1400);
    return () => clearTimeout(t);
  }, [categorySpend]);

  const budgetByCategory = useMemo(() => {
    const map = {};
    budgets.forEach(b => { map[b.category] = b.monthly_limit; });
    return map;
  }, [budgets]);

  async function refreshBudgets() {
    const { budgetRows } = await load();
    setBudgets(budgetRows);
  }

  async function saveBudgetFor(cat, val) {
    try {
      await setBudget(householdId, cat, val);
      await refreshBudgets();
      setEditingBudgetCat(null);
      setFlashCats([cat]);
      toast(`${cat} budget set to ${fmtCAD(val)} a month`);
    } catch (err) {
      toast(`Couldn't save the ${cat} budget: ${err.message}`, { error: true });
    }
  }

  async function clearBudgetFor(cat) {
    try {
      await removeBudget(householdId, cat);
      await refreshBudgets();
      setEditingBudgetCat(null);
      toast(`Removed the ${cat} budget`);
    } catch (err) {
      toast(`Couldn't remove the ${cat} budget: ${err.message}`, { error: true });
    }
  }

  const heroValue = horizon === 'payday' ? safeToSpend : projectedFreeCash;
  const heroCash = horizon === 'payday' ? cashOnHand : (cashOnHand + incomeThroughHorizon);
  const shownHero = useCountUp(accounts ? heroValue : null);

  if (error && !accounts) return <ErrorState message={`Couldn't load overview: ${error}`} />;
  if (!accounts || !rules || !transactions) return <LoadingState />;

  const heroSub = horizon === 'payday'
    ? (nextPayrollDate ? `Payday ${paydayLabel(nextPayrollDate)} · in ${daysToPayday} day${daysToPayday === 1 ? '' : 's'}` : 'No upcoming payday found on Infinity')
    : `After ${fmtCAD(committedTotal)} in bills and ${fmtCAD(incomeThroughHorizon)} income`;
  const cardNote = !includeCards ? null
    : cardTotals.surplus > 0
      ? `Card credit adds ${fmtCAD(cardTotals.surplus)} after ${fmtCAD(cardTotals.charges)} in card charges`
      : cardTotals.charges > 0 ? `Includes ${fmtCAD(cardTotals.uncovered)} in card charges not covered by credit` : null;

  return (
    <>
      <section className="hero" aria-labelledby="hero-label">
        <div className="hero-top">
          <span className="t-12 caps hero-soft" id="hero-label">{horizon === 'payday' ? 'Safe to spend' : 'Projected free cash'}</span>
          <span className="hero-select">
            <label className="sr-only" htmlFor="hero-horizon">Horizon</label>
            <select id="hero-horizon" value={horizon} onChange={e => setHorizon(e.target.value)}>
              <option value="payday">By next payday</option>
              {horizonMonths.map(ym => <option key={ym} value={ym}>End of {monthLabel(ym)}</option>)}
            </select>
            <IconChevronDown />
          </span>
        </div>
        <div className="hero-value t-44 display">{fmtCAD(shownHero)}</div>
        <div className="t-14 hero-soft">{heroSub}</div>
        <div className="hero-eq t-12 hero-soft">
          <span>{horizon === 'payday' ? 'Cash' : 'Cash + income'} <b><Money value={heroCash} /></b></span>
          <span>− Bills <b><Money value={committedTotal} /></b></span>
          {cardSurplus > 0 && <span>+ Card credit <b><Money value={cardSurplus} /></b></span>}
        </div>
        <label className="t-12 hero-soft" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeCards} onChange={e => toggleIncludeCards(e.target.checked)} />
          Include card credit and card charges
        </label>
        {cardNote && <div className="t-12 hero-soft">{cardNote}</div>}
        {heroValue < 0 && <span className="chip is-neg" style={{ alignSelf: 'flex-start' }}>Bills exceed cash by {fmtCAD(-heroValue)}</span>}
      </section>

      {onReview && uncategorizedMonthCount > 0 && (
        <section className={`review-banner${reviewCollapsed ? ' is-collapsed' : ''}`} aria-label="Transactions needing a category">
          <button
            type="button"
            className="review-collapse"
            onClick={toggleReviewCollapsed}
            aria-expanded={!reviewCollapsed}
            aria-label={reviewCollapsed ? 'Expand review reminder' : 'Collapse review reminder'}
          >
            {reviewCollapsed ? <IconChevronRight /> : <IconChevronDown />}
          </button>
          <div className="review-banner-text">
            <div className="t-14 semi">{uncategorizedMonthCount} to categorize this month</div>
            {!reviewCollapsed && (
              <div className="t-12">
                {uncategorizedThisMonth > 0
                  ? `${fmtCAD(uncategorizedThisMonth)} spent${uncategorizedShare > 0 ? ` · ${uncategorizedShare}% of spending` : ''}`
                  : 'No spending among them'}
                {uncategorizedCount > uncategorizedMonthCount ? ` · ${uncategorizedCount - uncategorizedMonthCount} older` : ''}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-primary" onClick={onReview}>Review</button>
        </section>
      )}

      <div className="overview-grid">
        <section className="card is-compact is-grouped" aria-labelledby="accounts-h">
          <div className="card-head">
            <h2 className="t-14 semi" id="accounts-h">Accounts</h2>
            <span className="t-12 muted">Net <Money value={netWorth} className="semi" style={{ color: 'var(--ink)' }} /></span>
          </div>
          <AccountGroups accounts={accounts} balances={balances} onSelectAccount={onSelectAccount} />
        </section>

        <section className="card is-grouped" aria-labelledby="spending-h">
          <div className="card-head">
            <h2 className="t-16 semi" id="spending-h">{monthLabel(thisMonthYm)} spending</h2>
            {onViewSpending && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={onViewSpending}>History<IconChevronRight /></button>
            )}
          </div>
          <div className="card-sub t-14 muted"><Money value={monthSpendTotal} className="semi" style={{ color: 'var(--ink)' }} /> so far this month</div>
          {categorySpend.length === 0 ? (
            <div className="t-14 muted">No spending yet this month.</div>
          ) : (
            <ul className="cats">
              {categorySpend.map(([cat, amt]) => (
                <CategoryRow
                  key={cat}
                  cat={cat}
                  amount={amt}
                  budget={budgetByCategory[cat]}
                  maxSpend={maxCategorySpend}
                  editing={editingBudgetCat === cat}
                  onEdit={() => setEditingBudgetCat(cat)}
                  onCancel={() => setEditingBudgetCat(null)}
                  onSave={saveBudgetFor}
                  onRemove={clearBudgetFor}
                  flash={flashCats.includes(cat)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
