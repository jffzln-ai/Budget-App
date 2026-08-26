import React, { useEffect, useState, useMemo } from 'react';
import {
  getRecurringRules, confirmRule, toggleSkipOccurrence, dismissRule, updateRuleAmount,
  getAccounts, getPlannedTransactions, addPlannedTransaction, removePlannedTransaction, updatePlannedTransaction,
} from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';
import { projectOccurrences, isIncome, todayIso } from './lib/occurrences.js';
import { IconMoreVertical } from './lib/icons.jsx';

const STATUS_LABEL = { active: 'Confirmed', needs_confirmation: 'Needs confirmation', pending_info: 'Waiting on you', dismissed: 'Dismissed' };
const STATUS_COLOR = { active: 'var(--pine)', needs_confirmation: 'var(--gold)', pending_info: 'var(--rust)', dismissed: 'var(--ink-soft)' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
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

const overflowItemStyle = {
  width: '100%', display: 'block', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--ink)',
};

const s = {
  card: { background: 'var(--card)', borderRadius: 20, boxShadow: '0 1px 3px rgba(27,33,29,0.04)' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', gap: 12, flexWrap: 'wrap' },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  badge: (color) => ({ fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 8, padding: '2px 7px', textTransform: 'uppercase' }),
  btn: { background: 'var(--pine)', color: 'var(--hero-text)', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  ghostBtn: { background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' },
  dangerBtn: { background: 'none', border: '1px solid var(--rust)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--rust)' },
  field: { padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, background: 'var(--card)' },
  segBtn: (active) => ({ padding: '5px 10px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', background: active ? 'var(--pine)' : 'var(--card)', color: active ? 'var(--hero-text)' : 'var(--ink)', cursor: 'pointer' }),
};

export default function Upcoming({ householdId }) {
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

  useEffect(() => {
    function closeMenu(e) {
      if (!e.target.closest('[data-row-menu]')) setOpenMenuId(null);
    }
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);
  const [plannedDraft, setPlannedDraft] = useState({ description: '', date: '', amount: '' });

  async function load() {
    try {
      const [r, accs, planned] = await Promise.all([getRecurringRules(householdId), getAccounts(householdId), getPlannedTransactions(householdId)]);
      setRules(r);
      setAccounts(accs);
      setPlannedTxns(planned);
      if (!plannedForm.account_id && accs.length) setPlannedForm(f => ({ ...f, account_id: accs[0].id }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [householdId]);

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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
      await load();
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!rules || !accounts) return <LoadingState label="Loading upcoming…" />;

  function renderOccurrence(o, moneyColor) {
    const isSkipped = (o.rule.skipped_dates || []).includes(o.date);
    const busy = busyKey === o.rule.id || busyKey === o.occId;

    if (o.rule.planned && editingPlannedId === o.rule.id) {
      return (
        <div key={o.occId} style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Description</div>
            <input style={{ ...s.field, width: '100%' }} value={plannedDraft.description} onChange={e => setPlannedDraft(d => ({ ...d, description: e.target.value }))} autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Date</div>
            <input style={s.field} type="date" value={plannedDraft.date} onChange={e => setPlannedDraft(d => ({ ...d, date: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Amount</div>
            <input style={{ ...s.field, width: 90 }} type="number" value={plannedDraft.amount} onChange={e => setPlannedDraft(d => ({ ...d, amount: e.target.value }))} />
          </div>
          <button style={s.btn} disabled={busy} onClick={() => savePlannedEdit(o.rule.id)}>{busy ? 'Saving…' : 'Save'}</button>
          <button style={s.ghostBtn} onClick={() => setEditingPlannedId(null)}>Cancel</button>
        </div>
      );
    }

    const income = isIncome(o.rule);
    return (
      <div key={o.occId} style={{ ...s.row, opacity: isSkipped ? 0.55 : 1 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500, textDecoration: isSkipped ? 'line-through' : 'none' }}>{o.rule.label}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtDate(o.date)} · {o.rule.planned ? 'one-off' : o.rule.cadence}{isSkipped ? ' · skipped' : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {editingAmountId === o.rule.id ? (
            <>
              <input style={{ ...s.field, width: 80 }} type="number" value={amountDraft} onChange={e => setAmountDraft(e.target.value)} autoFocus />
              <button style={s.btn} disabled={busy} onClick={() => saveRuleAmount(o.rule)}>{busy ? '…' : 'Save'}</button>
              <button style={s.ghostBtn} onClick={() => setEditingAmountId(null)}>Cancel</button>
            </>
          ) : (
            <span style={{ ...s.num, fontSize: 14, fontWeight: 600, color: isSkipped ? 'var(--ink-soft)' : income ? 'var(--pine)' : moneyColor }}>
              {income ? '+' : ''}{fmtCAD(o.rule.expected_amount)}
            </span>
          )}
          {editingAmountId !== o.rule.id && (<>
            {!o.rule.planned && !income && <span style={s.badge(STATUS_COLOR[o.rule.status])}>{STATUS_LABEL[o.rule.status]}</span>}
            {!o.rule.planned && o.rule.status === 'needs_confirmation' && (
              <button style={s.btn} disabled={busy} onClick={() => handleConfirm(o.rule)}>{busy ? 'Saving…' : 'Confirm'}</button>
            )}
            {!o.rule.planned && !income && o.rule.status !== 'needs_confirmation' && (
              <button style={s.ghostBtn} disabled={busy} onClick={() => handleSkip(o)}>{busy ? '…' : isSkipped ? 'Restore' : 'Skip'}</button>
            )}
            <div data-row-menu style={{ position: 'relative' }}>
              <button
                onClick={() => setOpenMenuId(openMenuId === o.occId ? null : o.occId)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
              ><IconMoreVertical color="var(--ink-soft)" /></button>
              {openMenuId === o.occId && (
                <div style={{
                  position: 'absolute', right: 0, top: 30, background: 'var(--card)', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(27,33,29,0.16)', minWidth: 130, overflow: 'hidden', zIndex: 10,
                }}>
                  {o.rule.planned ? (<>
                    <button onClick={() => { startEditPlanned(plannedTxns.find(p => p.id === o.rule.id)); setOpenMenuId(null); }} style={overflowItemStyle}>Edit</button>
                    <button onClick={() => { handleRemovePlanned(o.rule.id); setOpenMenuId(null); }} style={{ ...overflowItemStyle, color: 'var(--rust)' }}>Delete</button>
                  </>) : (<>
                    <button onClick={() => { startEditAmount(o.rule.id, o.rule.expected_amount); setOpenMenuId(null); }} style={overflowItemStyle}>Edit</button>
                    <button onClick={() => { handleDismissRule(o.rule); setOpenMenuId(null); }} style={{ ...overflowItemStyle, color: 'var(--rust)' }}>Delete</button>
                  </>)}
                </div>
              )}
            </div>
          </>)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <select style={s.field} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 0 }}>
          <button style={{ ...s.segBtn(view === 'list'), borderRadius: '4px 0 0 4px' }} onClick={() => setView('list')}>List</button>
          <button style={{ ...s.segBtn(view === 'calendar'), borderRadius: '0 4px 4px 0' }} onClick={() => setView('calendar')}>Calendar</button>
        </div>
      </div>

      {nextPayrollDate && (
        <div style={{ ...s.card, padding: '14px 20px', marginBottom: 14, background: 'var(--pine)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'rgba(248,246,240,0.8)' }}>Due on Infinity before next payday ({fmtDate(nextPayrollDate)})</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: 'var(--hero-text)' }}>{fmtCAD(dueBeforePayday)}</div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div style={{ ...s.card, padding: 16, marginBottom: 14, border: '1px solid var(--rust)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 8 }}>Waiting on you</div>
          {unscheduled.map(r => (
            <div key={r.id} style={{ fontSize: 13, padding: '4px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{r.label} — <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{r.note}</span></span>
              <button style={s.dangerBtn} onClick={() => handleDismissRule(r)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {view === 'list' ? (
        monthGroups.map(([ym, occs]) => {
          const income = occs.filter(o => isIncome(o.rule) && countsTowardTotal(o)).reduce((sum, o) => sum + o.rule.expected_amount, 0);
          const expense = occs.filter(o => !isIncome(o.rule) && countsTowardTotal(o)).reduce((sum, o) => sum + o.rule.expected_amount, 0);
          const net = income - expense;
          return (
            <div key={ym} style={{ ...s.card, marginBottom: 14 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600 }}>{monthLabel(ym)}</div>
                <div style={{ fontSize: 12, display: 'flex', gap: 12 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>In: <span style={{ ...s.num, color: 'var(--pine)', fontWeight: 600 }}>{fmtCAD(income)}</span></span>
                  <span style={{ color: 'var(--ink-soft)' }}>Out: <span style={{ ...s.num, color: 'var(--ink)', fontWeight: 600 }}>{fmtCAD(expense)}</span></span>
                  <span style={{ color: 'var(--ink-soft)' }}>Net: <span style={{ ...s.num, color: net < 0 ? 'var(--rust)' : 'var(--pine)', fontWeight: 700 }}>{fmtCAD(net)}{net < 0 ? ' short' : ''}</span></span>
                </div>
              </div>
              {occs.map(o => renderOccurrence(o, 'var(--ink)'))}
            </div>
          );
        })
      ) : (
        <div style={{ ...s.card, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <button style={s.ghostBtn} onClick={() => setCalendarMonth(m => shiftMonth(m, -1))}>← Prev</button>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600 }}>{monthLabel(calendarMonth)}</div>
            <button style={s.ghostBtn} onClick={() => setCalendarMonth(m => shiftMonth(m, 1))}>Next →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {WEEKDAYS.map(w => <div key={w} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textAlign: 'center', padding: '2px 0' }}>{w}</div>)}
            {buildCalendarCells(calendarMonth).map((date, i) => (
              <div key={i} style={{ minHeight: 64, border: date ? '1px solid var(--line)' : 'none', borderRadius: 10, padding: 4, background: date ? 'var(--card)' : 'transparent' }}>
                {date && (<>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 2 }}>{Number(date.slice(8))}</div>
                  {(occByDate[date] || []).slice(0, 3).map(o => {
                    const isSkipped = (o.rule.skipped_dates || []).includes(o.date);
                    const income = isIncome(o.rule);
                    return (
                      <div key={o.occId} title={`${o.rule.label} ${fmtCAD(o.rule.expected_amount)}`} style={{
                        fontSize: 9.5, padding: '1px 3px', marginBottom: 1, borderRadius: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        background: isSkipped ? 'var(--line)' : income ? 'var(--pine)' : 'var(--pine-soft)', color: isSkipped ? 'var(--ink-soft)' : income ? 'var(--hero-text)' : 'var(--ink)',
                        textDecoration: isSkipped ? 'line-through' : 'none',
                      }}>{o.rule.label}</div>
                    );
                  })}
                  {(occByDate[date] || []).length > 3 && <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>+{occByDate[date].length - 3} more</div>}
                </>)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...s.card, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 10 }}>Add a one-off planned expense</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 3 }}>Description</div>
            <input style={{ ...s.field, width: '100%' }} value={plannedForm.description} onChange={e => setPlannedForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. New tires" />
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 3 }}>Account</div>
            <select style={s.field} value={plannedForm.account_id} onChange={e => setPlannedForm(f => ({ ...f, account_id: e.target.value }))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 3 }}>Date</div>
            <input style={s.field} type="date" value={plannedForm.date} onChange={e => setPlannedForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 3 }}>Amount</div>
            <input style={{ ...s.field, width: 90 }} type="number" value={plannedForm.amount} onChange={e => setPlannedForm(f => ({ ...f, amount: e.target.value }))} placeholder="-$ or +$" />
          </div>
          <button style={s.btn} disabled={savingPlanned} onClick={handleAddPlanned}>{savingPlanned ? 'Saving…' : 'Add'}</button>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 8 }}>Use a negative amount for an expense, positive for expected income.</div>
      </div>
    </div>
  );
}
