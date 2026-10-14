import React, { useEffect, useState, useMemo } from 'react';
import {
  getRecurringRules, confirmRule, toggleSkipOccurrence, dismissRule, updateRuleAmount,
  getAccounts, getPlannedTransactions, addPlannedTransaction, removePlannedTransaction, updatePlannedTransaction,
} from './lib/queries.js';
import { LoadingState, ErrorState, EmptyState } from './lib/states.jsx';
import { projectOccurrences, isIncome, todayIso } from './lib/occurrences.js';
import { useToast } from './lib/toast.jsx';
import { useCountUp } from './lib/useCountUp.js';
import { IconMoreVertical, IconChevronRight, IconPlus } from './lib/icons.jsx';

// Confirmed is the normal state, so it gets no chip; the others are filled chips on the semantic palette.
const STATUS_CHIP = {
  needs_confirmation: { label: 'Needs confirmation', cls: 'is-warn' },
  pending_info: { label: 'Waiting on you', cls: 'is-warn' },
  dismissed: { label: 'Dismissed', cls: 'is-muted' },
};
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShortDay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}
function thisMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function buildCalendarCells(ym) {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = new Date(y, m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
// Counts toward a total: not skipped, and not still awaiting a yes/no from the user.
function countsTowardTotal(o) {
  return o.rule.status !== 'needs_confirmation' && !(o.rule.skipped_dates || []).includes(o.date);
}

export default function Upcoming({ householdId, refreshKey = 0 }) {
  const toast = useToast();
  const [rules, setRules] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [plannedTxns, setPlannedTxns] = useState([]);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [view, setView] = useState('list');
  const [accountFilter, setAccountFilter] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(thisMonthYm());
  const [plannedForm, setPlannedForm] = useState({ description: '', account_id: '', date: '', amount: '' });
  const [savingPlanned, setSavingPlanned] = useState(false);
  const [editingAmountId, setEditingAmountId] = useState(null);
  const [amountDraft, setAmountDraft] = useState('');
  const [editingPlannedId, setEditingPlannedId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [plannedOpen, setPlannedOpen] = useState(false);

  useEffect(() => {
    function closeMenu(e) {
      if (!e.target.closest('[data-row-menu]')) setOpenMenuId(null);
    }
    function onKey(e) { if (e.key === 'Escape') setOpenMenuId(null); }
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', closeMenu); document.removeEventListener('keydown', onKey); };
  }, []);
  const [plannedDraft, setPlannedDraft] = useState({ description: '', date: '', amount: '' });

  async function load() {
    try {
      const [r, accs, planned] = await Promise.all([getRecurringRules(householdId), getAccounts(householdId), getPlannedTransactions(householdId)]);
      setRules(r);
      setAccounts(accs);
      setPlannedTxns(planned);
      if (!plannedForm.account_id && accs.length) setPlannedForm(f => ({ ...f, account_id: accs[0].id }));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [householdId, refreshKey]);

  // Action failures are reported as a toast; the page stays usable.
  const fail = (what, err) => toast(`${what}: ${err.message}`, { error: true });

  const today = todayIso();

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
    return [...fromRules, ...fromPlanned]
      .filter(o => o.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rules, plannedTxns, today]);

  const unscheduled = (rules || []).filter(r => r.status !== 'dismissed' && !r.next_expected_date);

  // Quick top-line stat: what's committed on the main chequing account before
  // the next paycheque lands - the number people actually check day to day.
  const infinityAccount = accounts ? accounts.find(a => a.name === 'Infinity') : null;
  const nextPayrollDate = useMemo(() => {
    if (!infinityAccount) return null;
    const occ = occurrences.find(o => o.rule.account_id === infinityAccount.id && isIncome(o.rule) && countsTowardTotal(o));
    return occ ? occ.date : null;
  }, [occurrences, infinityAccount]);
  const dueBeforePayday = useMemo(() => {
    if (!infinityAccount || !nextPayrollDate) return 0;
    return occurrences
      .filter(o => o.rule.account_id === infinityAccount.id && !isIncome(o.rule) && o.date <= nextPayrollDate && countsTowardTotal(o))
      .reduce((sum, o) => sum + o.rule.expected_amount, 0);
  }, [occurrences, infinityAccount, nextPayrollDate]);

  const displayedOccurrences = useMemo(() => {
    if (accountFilter === 'all') return occurrences;
    return occurrences.filter(o => o.rule.account_id === accountFilter);
  }, [occurrences, accountFilter]);

  const monthGroups = useMemo(() => {
    const groups = {};
    displayedOccurrences.forEach(o => { const ym = o.date.slice(0, 7); (groups[ym] = groups[ym] || []).push(o); });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayedOccurrences]);

  const occByDate = useMemo(() => {
    const map = {};
    displayedOccurrences.forEach(o => { (map[o.date] = map[o.date] || []).push(o); });
    return map;
  }, [displayedOccurrences]);

  async function handleConfirm(rule) {
    setBusyKey(rule.id);
    try {
      await confirmRule(rule.id);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSkip(occ) {
    setBusyKey(occ.occId);
    try {
      await toggleSkipOccurrence(occ.rule.id, occ.rule.skipped_dates || [], occ.date);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDismissRule(rule) {
    if (!window.confirm(`Remove "${rule.label}" from Upcoming? This stops tracking it as a recurring bill - it won't delete any past transactions.`)) return;
    setBusyKey(rule.id);
    try {
      await dismissRule(rule.id);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyKey(null);
    }
  }

  function startEditAmount(id, currentAmount) {
    setEditingAmountId(id);
    setAmountDraft(String(currentAmount));
  }

  async function saveRuleAmount(rule) {
    const amt = parseFloat(amountDraft);
    if (Number.isNaN(amt) || amt < 0) return;
    setBusyKey(rule.id);
    try {
      await updateRuleAmount(rule.id, amt);
      setEditingAmountId(null);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddPlanned() {
    const amt = parseFloat(plannedForm.amount);
    if (!plannedForm.description.trim() || !plannedForm.date || !plannedForm.account_id || Number.isNaN(amt)) return;
    setSavingPlanned(true);
    try {
      await addPlannedTransaction(householdId, {
        account_id: plannedForm.account_id, description: plannedForm.description.trim(), date: plannedForm.date, amount: amt,
      });
      setPlannedForm(f => ({ ...f, description: '', date: '', amount: '' }));
      setPlannedOpen(false);
      toast(`Added ${plannedForm.description.trim()} to Upcoming`);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setSavingPlanned(false);
    }
  }

  async function handleRemovePlanned(id) {
    if (!window.confirm('Delete this planned expense?')) return;
    try {
      await removePlannedTransaction(id);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    }
  }

  function startEditPlanned(p) {
    setEditingPlannedId(p.id);
    setPlannedDraft({ description: p.description, date: p.date, amount: String(p.amount) });
  }

  async function savePlannedEdit(id) {
    const amt = parseFloat(plannedDraft.amount);
    if (!plannedDraft.description.trim() || !plannedDraft.date || Number.isNaN(amt)) return;
    setBusyKey(id);
    try {
      await updatePlannedTransaction(id, { description: plannedDraft.description.trim(), date: plannedDraft.date, amount: amt });
      setEditingPlannedId(null);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyKey(null);
    }
  }

  const shownDue = useCountUp(rules && accounts ? dueBeforePayday : null);

  if (error && !rules) return <ErrorState message={`Couldn't load upcoming: ${error}`} />;
  if (!rules || !accounts) return <LoadingState label="Loading upcoming…" />;

  const billsBeforePayday = infinityAccount && nextPayrollDate
    ? occurrences.filter(o => o.rule.account_id === infinityAccount.id && !isIncome(o.rule) && o.date <= nextPayrollDate && countsTowardTotal(o)).length
    : 0;
  // The only part of this page that needs a decision gets its own card at the top.
  const needsConfirmation = rules.filter(r => r.status === 'needs_confirmation' && r.next_expected_date);
  const needsYouCount = needsConfirmation.length + unscheduled.length;

  function dotClass(o) {
    if ((o.rule.skipped_dates || []).includes(o.date)) return 'dot-skip';
    if (o.rule.status === 'needs_confirmation' || o.rule.status === 'pending_info') return 'dot-attn';
    return isIncome(o.rule) ? 'dot-income' : 'dot-bill';
  }

  function renderOccurrence(o) {
    const isSkipped = (o.rule.skipped_dates || []).includes(o.date);
    const busy = busyKey === o.rule.id || busyKey === o.occId;

    if (o.rule.planned && editingPlannedId === o.rule.id) {
      return (
        <div key={o.occId} className="occ">
          <form className="form-row" style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); savePlannedEdit(o.rule.id); }}>
            <label className="field" style={{ flexBasis: 180 }}><span>Description</span>
              <input className="input" value={plannedDraft.description} onChange={e => setPlannedDraft(d => ({ ...d, description: e.target.value }))} autoFocus />
            </label>
            <label className="field"><span>Date</span>
              <input className="input" type="date" value={plannedDraft.date} onChange={e => setPlannedDraft(d => ({ ...d, date: e.target.value }))} />
            </label>
            <label className="field"><span>Amount</span>
              <input className="input" type="number" inputMode="decimal" value={plannedDraft.amount} onChange={e => setPlannedDraft(d => ({ ...d, amount: e.target.value }))} />
            </label>
            <div className="toolbar">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditingPlannedId(null)}>Cancel</button>
            </div>
          </form>
        </div>
      );
    }

    const income = isIncome(o.rule);
    const chip = !o.rule.planned && !income ? STATUS_CHIP[o.rule.status] : null;
    const menuOpen = openMenuId === o.occId;
    return (
      <div key={o.occId} className={`occ${isSkipped ? ' is-skipped' : ''}`}>
        <div className="occ-main">
          <span className="occ-title t-14 semi">{o.rule.label}</span>
          <span className="t-12 muted">{fmtShortDay(o.date)} · {o.rule.planned ? 'one-off' : o.rule.cadence}{isSkipped ? ' · skipped' : ''}</span>
        </div>
        <div className="occ-end">
          {editingAmountId === o.rule.id ? (
            <form className="toolbar" onSubmit={e => { e.preventDefault(); saveRuleAmount(o.rule); }}>
              <label className="sr-only" htmlFor={`amt-${o.occId}`}>Amount for {o.rule.label}</label>
              <input id={`amt-${o.occId}`} className="input input-sm" type="number" inputMode="decimal" value={amountDraft} onChange={e => setAmountDraft(e.target.value)} autoFocus />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditingAmountId(null)}>Cancel</button>
            </form>
          ) : (<>
            {chip && <span className={`chip ${chip.cls}`}>{chip.label}</span>}
            <span className={`num t-14${income && !isSkipped ? ' pos' : ''}`} style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{income ? '+' : ''}{fmtCAD(o.rule.expected_amount)}</span>
            {!o.rule.planned && o.rule.status === 'needs_confirmation' && (
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleConfirm(o.rule)}>{busy ? 'Saving…' : 'Confirm'}</button>
            )}
            {!o.rule.planned && !income && o.rule.status !== 'needs_confirmation' && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => handleSkip(o)}>{busy ? 'Saving…' : isSkipped ? 'Restore' : 'Skip'}</button>
            )}
            <div className="menu-anchor" data-row-menu>
              <button
                type="button"
                className="btn-icon"
                aria-label={`More actions for ${o.rule.label}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setOpenMenuId(menuOpen ? null : o.occId)}
              ><IconMoreVertical /></button>
              {menuOpen && (
                <div className="menu" role="menu">
                  {o.rule.planned ? (<>
                    <button type="button" role="menuitem" onClick={() => { startEditPlanned(plannedTxns.find(p => p.id === o.rule.id)); setOpenMenuId(null); }}>Edit</button>
                    <button type="button" role="menuitem" className="is-neg" onClick={() => { handleRemovePlanned(o.rule.id); setOpenMenuId(null); }}>Delete</button>
                  </>) : (<>
                    <button type="button" role="menuitem" onClick={() => { startEditAmount(o.rule.id, o.rule.expected_amount); setOpenMenuId(null); }}>Edit amount</button>
                    <button type="button" role="menuitem" className="is-neg" onClick={() => { handleDismissRule(o.rule); setOpenMenuId(null); }}>Stop tracking</button>
                  </>)}
                </div>
              )}
            </div>
          </>)}
        </div>
      </div>
    );
  }

  const selectedOccs = selectedDate ? (occByDate[selectedDate] || []) : [];

  // Rest of this month, for whichever accounts are showing.
  const thisYm = today.slice(0, 7);
  const restOfMonth = displayedOccurrences.filter(o => o.date.startsWith(thisYm) && countsTowardTotal(o));
  const billsLeft = restOfMonth.filter(o => !isIncome(o.rule));
  const incomeLeft = restOfMonth.filter(o => isIncome(o.rule));
  const sumOf = list => list.reduce((sum, o) => sum + o.rule.expected_amount, 0);

  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <label className="sr-only" htmlFor="up-account">Account</label>
        <select id="up-account" className="input" style={{ width: 'auto', minWidth: 160 }} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="toolbar">
          <div className="segmented hide-wide" role="group" aria-label="View" style={{ minWidth: 180 }}>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
            <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
          </div>
          <button type="button" className="btn btn-primary" aria-expanded={plannedOpen} aria-controls="plan-form" onClick={() => setPlannedOpen(v => !v)}>
            {plannedOpen ? 'Close' : <><IconPlus />Planned expense</>}
          </button>
        </div>
      </div>

      {plannedOpen && (
        <section className="card" id="plan-form" aria-labelledby="plan-h">
          <h2 className="t-16 semi" id="plan-h" style={{ margin: 0 }}>Add a one-off planned expense</h2>
          <form className="form-row" onSubmit={e => { e.preventDefault(); handleAddPlanned(); }}>
            <label className="field" style={{ flexBasis: 200 }}><span>Description</span>
              <input className="input" value={plannedForm.description} onChange={e => setPlannedForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. New tires" autoFocus />
            </label>
            <label className="field"><span>Account</span>
              <select className="input" value={plannedForm.account_id} onChange={e => setPlannedForm(f => ({ ...f, account_id: e.target.value }))}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Date</span>
              <input className="input" type="date" value={plannedForm.date} onChange={e => setPlannedForm(f => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="field"><span>Amount</span>
              <input className="input" type="number" inputMode="decimal" value={plannedForm.amount} onChange={e => setPlannedForm(f => ({ ...f, amount: e.target.value }))} placeholder="−$ or +$" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={savingPlanned}>{savingPlanned ? 'Saving…' : 'Add'}</button>
          </form>
          <div className="t-12 muted">Use a negative amount for an expense, positive for expected income.</div>
        </section>
      )}

      <div className="stats is-4">
        <div className="stat">
          <span className="t-12 caps muted">Due before payday</span>
          <span className="stat-value">{nextPayrollDate ? fmtCAD(shownDue) : '—'}</span>
          <span className="t-12 muted">{nextPayrollDate ? `${billsBeforePayday} bill${billsBeforePayday === 1 ? '' : 's'} on Infinity by ${fmtShortDay(nextPayrollDate)}` : 'No payday found on Infinity'}</span>
        </div>
        <div className="stat">
          <span className="t-12 caps muted">Bills left this month</span>
          <span className="stat-value">{fmtCAD(sumOf(billsLeft))}</span>
          <span className="t-12 muted">{billsLeft.length} bill{billsLeft.length === 1 ? '' : 's'}</span>
        </div>
        <div className="stat">
          <span className="t-12 caps muted">Income to come</span>
          <span className="stat-value pos">+{fmtCAD(sumOf(incomeLeft))}</span>
          <span className="t-12 muted">{incomeLeft.length ? `${incomeLeft.length} deposit${incomeLeft.length === 1 ? '' : 's'} this month` : 'None left this month'}</span>
        </div>
        <div className="stat">
          <span className="t-12 caps muted">Needs you</span>
          <span className="stat-value" style={needsYouCount ? { color: 'var(--status-warn-text)' } : undefined}>{needsYouCount}</span>
          <span className="t-12 muted">{needsYouCount ? 'Bills to confirm' : 'All confirmed'}</span>
        </div>
      </div>

      {needsYouCount > 0 && (
        <section className="card attention" aria-labelledby="needs-h">
          <div className="card-head">
            <h2 className="t-16 semi" id="needs-h">Needs you</h2>
            <span className="chip is-warn">{needsYouCount}</span>
          </div>
          {needsConfirmation.map(r => (
            <div key={r.id} className="occ" style={{ padding: '4px 0' }}>
              <div className="occ-main">
                <span className="t-14 semi">{r.label}</span>
                <span className="t-12 muted">{r.note || `Confirm this ${r.cadence} bill`} · {fmtCAD(r.expected_amount)}</span>
              </div>
              <div className="occ-end">
                <button type="button" className="btn btn-primary btn-sm" disabled={busyKey === r.id} onClick={() => handleConfirm(r)}>{busyKey === r.id ? 'Saving…' : 'Confirm'}</button>
                <button type="button" className="btn btn-quiet btn-sm is-neg" disabled={busyKey === r.id} onClick={() => handleDismissRule(r)}>Remove</button>
              </div>
            </div>
          ))}
          {unscheduled.map(r => (
            <div key={r.id} className="occ" style={{ padding: '4px 0' }}>
              <div className="occ-main">
                <span className="t-14 semi">{r.label}</span>
                <span className="t-12 muted">{r.note || 'No next date found'}</span>
              </div>
              <div className="occ-end">
                <button type="button" className="btn btn-quiet btn-sm is-neg" disabled={busyKey === r.id} onClick={() => handleDismissRule(r)}>Remove</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="split-layout up-layout">
      <div className={`split-main stack${view === 'calendar' ? ' hide-narrow' : ''}`}>
      {monthGroups.length === 0 ? (
          <div className="card"><EmptyState label="Nothing scheduled ahead." /></div>
        ) : monthGroups.map(([ym, occs]) => {
          const income = occs.filter(o => isIncome(o.rule) && countsTowardTotal(o)).reduce((sum, o) => sum + o.rule.expected_amount, 0);
          const expense = occs.filter(o => !isIncome(o.rule) && countsTowardTotal(o)).reduce((sum, o) => sum + o.rule.expected_amount, 0);
          const net = income - expense;
          return (
            <section key={ym} className="card" aria-labelledby={`m-${ym}`}>
              <div className="card-head" style={{ flexWrap: 'wrap' }}>
                <h2 className="t-16 semi" id={`m-${ym}`}>{monthLabel(ym)}</h2>
                <div className="month-sum t-12 muted">
                  <span>In <b className="pos">{fmtCAD(income)}</b></span>
                  <span>Out <b style={{ color: 'var(--ink)' }}>{fmtCAD(expense)}</b></span>
                  <span>Net <b className={net < 0 ? 'neg' : 'pos'}>{net < 0 ? '−' : ''}{fmtCAD(net)}{net < 0 ? ' short' : ''}</b></span>
                </div>
              </div>
              <div>{occs.map(renderOccurrence)}</div>
            </section>
          );
        })}
      </div>

      <aside className={`split-aside${view === 'list' ? ' hide-narrow' : ''}`} aria-label="Calendar">
        <section className="card" aria-labelledby="cal-h">
          <div className="cal-nav">
            <button type="button" className="btn-icon" aria-label="Previous month" onClick={() => { setCalendarMonth(m => shiftMonth(m, -1)); setSelectedDate(null); }}>
              <span style={{ display: 'flex', transform: 'rotate(180deg)' }}><IconChevronRight /></span>
            </button>
            <h2 className="t-16 semi" id="cal-h">{monthLabel(calendarMonth)}</h2>
            <button type="button" className="btn-icon" aria-label="Next month" onClick={() => { setCalendarMonth(m => shiftMonth(m, 1)); setSelectedDate(null); }}>
              <IconChevronRight />
            </button>
          </div>
          <div className="cal">
            {WEEKDAYS.map((w, i) => <div key={`wd-${i}`} className="cal-wd" aria-hidden="true">{w}</div>)}
            {buildCalendarCells(calendarMonth).map((date, i) => {
              if (!date) return <div key={`blank-${i}`} />;
              const occs = occByDate[date] || [];
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  className={`cal-day${isToday ? ' is-today' : ''}${occs.length ? '' : ' is-quiet'}`}
                  aria-pressed={selectedDate === date}
                  aria-label={`${fmtDate(date)}: ${occs.length ? `${occs.length} item${occs.length === 1 ? '' : 's'}` : 'nothing due'}`}
                  onClick={() => setSelectedDate(selectedDate === date ? null : date)}
                >
                  <span>{Number(date.slice(8))}</span>
                  <span className="cal-dots" aria-hidden="true">{occs.slice(0, 3).map(o => <i key={o.occId} className={dotClass(o)} />)}</span>
                </button>
              );
            })}
          </div>
          <div className="legend t-12 muted" aria-hidden="true">
            <span><i className="dot-bill" />Bill</span>
            <span><i className="dot-income" />Income</span>
            <span><i className="dot-attn" />Needs you</span>
          </div>
          {selectedDate ? (
            <div>
              <div className="t-12 caps muted" style={{ padding: '8px 8px 0' }}>{WEEKDAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]}, {fmtDate(selectedDate)}</div>
              {selectedOccs.length ? selectedOccs.map(renderOccurrence) : <EmptyState label="Nothing due this day." />}
            </div>
          ) : (
            <div className="t-12 muted">Tap a day to see what's due.</div>
          )}
        </section>
      </aside>
      </div>
    </div>
  );
}
