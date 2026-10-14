import React, { useEffect, useState, useMemo } from 'react';
import {
  getAccounts, getAllTransactions, getTransactionTags,
  updateTransaction, addTransactionTag, removeTransactionTag,
  getCustomCategories, addCustomCategory, getCategoryRules, setCategoryRule, removeCategoryRule, applyCategoryToMatching,
  linkTransfer,
} from './lib/queries.js';
import { LoadingState, ErrorState, EmptyState } from './lib/states.jsx';
import { useToast } from './lib/toast.jsx';
import { IconCheck, IconPencil, IconFilter, IconSearch } from './lib/icons.jsx';

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '−' : '+';
  return sign + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// For always-positive magnitudes (category breakdown sums) - fmtCAD's leading
// '+' is only meaningful for signed transaction amounts, not a total spent.
function fmtAbsCAD(n) {
  return '$' + Math.abs(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function ymKey(date) { return date.slice(0, 7); }
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}
function pad2(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

// One-tap periods above the list; the Filters panel has the full set.
const QUICK_PERIODS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: '3 months' },
  { key: 'all', label: 'All time' },
];

// Named ranges relative to today; specific months and 'custom' are handled separately.
function periodRange(period, today) {
  const [ty, tm] = today.split('-').map(Number);
  switch (period) {
    case 'this_month':
      return { start: iso(ty, tm, 1), end: today };
    case 'last_month': {
      const m = tm === 1 ? 12 : tm - 1;
      const y = tm === 1 ? ty - 1 : ty;
      return { start: iso(y, m, 1), end: iso(y, m, new Date(y, m, 0).getDate()) };
    }
    case 'last_3_months':
    case 'last_6_months':
    case 'last_12_months': {
      const n = { last_3_months: 3, last_6_months: 6, last_12_months: 12 }[period];
      const d = new Date(ty, tm - 1, 1);
      d.setMonth(d.getMonth() - (n - 1));
      return { start: iso(d.getFullYear(), d.getMonth() + 1, 1), end: today };
    }
    case 'ytd':
      return { start: iso(ty, 1, 1), end: today };
    case 'last_year':
      return { start: iso(ty - 1, 1, 1), end: iso(ty - 1, 12, 31) };
    default:
      return null;
  }
}

export default function Transactions({ householdId, refreshKey = 0, initialAccountFilter, onConsumeInitialFilter, initialBreakdownOpen, onConsumeInitialBreakdownOpen }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [tags, setTags] = useState({});
  const [customCategories, setCustomCategories] = useState([]);
  const [categoryRules, setCategoryRules] = useState([]);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [showTransfers, setShowTransfers] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [addingCategoryForId, setAddingCategoryForId] = useState(null);
  const [newCategoryForm, setNewCategoryForm] = useState({ name: '', group: 'Other' });
  const [pendingBulkApply, setPendingBulkApply] = useState(null);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingDetailsId, setEditingDetailsId] = useState(null);
  const [detailsDraft, setDetailsDraft] = useState({ raw_description: '', date: '', amount: '', account_id: '' });
  const [busyId, setBusyId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCategoryChoice, setBulkCategoryChoice] = useState('');
  const [bulkAccountChoice, setBulkAccountChoice] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    try {
      const [accs, txns, tagMap, customCats, rules] = await Promise.all([
        getAccounts(householdId), getAllTransactions(householdId), getTransactionTags(householdId),
        getCustomCategories(householdId), getCategoryRules(householdId),
      ]);
      setAccounts(accs);
      setTransactions(txns);
      setTags(tagMap);
      setCustomCategories(customCats);
      setCategoryRules(rules);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [householdId, refreshKey]);

  // Action failures are reported as a toast; the list stays on screen.
  const fail = (what, err) => toast(`${what}: ${err.message}`, { error: true });

  useEffect(() => {
    if (initialAccountFilter) {
      setAccountFilter(initialAccountFilter);
      if (onConsumeInitialFilter) onConsumeInitialFilter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccountFilter]);

  useEffect(() => {
    if (initialBreakdownOpen) {
      setBreakdownOpen(true);
      setFiltersOpen(true);
      if (onConsumeInitialBreakdownOpen) onConsumeInitialBreakdownOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBreakdownOpen]);

  const accountsById = useMemo(() => {
    const map = {};
    (accounts || []).forEach(a => { map[a.id] = a; });
    return map;
  }, [accounts]);

  const knownCategories = useMemo(() => {
    if (!transactions) return [];
    const fromTxns = transactions.map(t => t.category);
    const fromCustom = customCategories.map(c => c.name);
    return Array.from(new Set([...fromTxns, ...fromCustom])).sort();
  }, [transactions, customCategories]);

  const today = todayIso();

  const lastPaydayDate = useMemo(() => {
    if (!transactions) return null;
    const payrolls = transactions.filter(t => t.category === 'Payroll' && t.date <= today).sort((a, b) => b.date.localeCompare(a.date));
    return payrolls.length ? payrolls[0].date : null;
  }, [transactions, today]);

  const availableMonths = useMemo(() => {
    if (!transactions) return [];
    return Array.from(new Set(transactions.map(t => ymKey(t.date)))).sort().reverse();
  }, [transactions]);

  function matchesPeriod(t) {
    if (period === 'all') return true;
    if (period === 'pay_period') return lastPaydayDate && t.date >= lastPaydayDate;
    if (period === 'custom') {
      if (customFrom && t.date < customFrom) return false;
      if (customTo && t.date > customTo) return false;
      return true;
    }
    const range = periodRange(period, today);
    if (range) return t.date >= range.start && t.date <= range.end;
    return ymKey(t.date) === period;
  }

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter(t => accountFilter === 'all' || t.account_id === accountFilter)
      .filter(t => categoryFilter === 'all' || t.category === categoryFilter)
      .filter(t => unmatchedOnly ? (t.is_transfer && t.needs_review) : (showTransfers || !t.is_transfer))
      .filter(t => !q || t.raw_description.toLowerCase().includes(q.toLowerCase()))
      .filter(matchesPeriod)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, accountFilter, categoryFilter, showTransfers, unmatchedOnly, q, period, customFrom, customTo, lastPaydayDate, today]);

  // Category totals for whatever account/date-range/search is active, independent of
  // categoryFilter itself (that would otherwise collapse the breakdown to one row) and
  // always excluding transfers, so "how much on X over Y" reads straight off this list.
  const categoryBreakdown = useMemo(() => {
    if (!transactions) return [];
    const totals = {};
    transactions
      .filter(t => accountFilter === 'all' || t.account_id === accountFilter)
      .filter(t => !t.is_transfer)
      .filter(t => !q || t.raw_description.toLowerCase().includes(q.toLowerCase()))
      .filter(matchesPeriod)
      .forEach(t => {
        if (t.amount >= 0) return;
        totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
      });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, accountFilter, q, period, customFrom, customTo, lastPaydayDate, today]);
  const categoryBreakdownTotal = categoryBreakdown.reduce((sum, [, amt]) => sum + amt, 0);
  const maxCategoryBreakdown = categoryBreakdown.length ? categoryBreakdown[0][1] : 1;

  const periodLabel = useMemo(() => {
    switch (period) {
      case 'all': return 'all time';
      case 'pay_period': return 'this pay period';
      case 'this_month': return 'this month';
      case 'last_month': return 'last month';
      case 'last_3_months': return 'last 3 months';
      case 'last_6_months': return 'last 6 months';
      case 'last_12_months': return 'last 12 months';
      case 'ytd': return 'year to date';
      case 'last_year': return String(Number(today.slice(0, 4)) - 1);
      case 'custom': return (customFrom || customTo) ? `${customFrom || '…'} to ${customTo || '…'}` : 'custom range';
      default: return monthLabel(period);
    }
  }, [period, customFrom, customTo, today]);

  // Full unmatched set (not filtered) so a candidate on a different account
  // is still findable even if the current filters would otherwise hide it.
  const unmatchedTransfers = useMemo(() => (transactions || []).filter(t => t.is_transfer && t.needs_review), [transactions]);

  function candidatesFor(txn) {
    return unmatchedTransfers
      .filter(t => t.id !== txn.id && t.account_id !== txn.account_id)
      .sort((a, b) => Math.abs(new Date(a.date) - new Date(txn.date)) - Math.abs(new Date(b.date) - new Date(txn.date)))
      .slice(0, 8);
  }

  async function handleLink(txn, candidate) {
    setBusyId(txn.id);
    try {
      await linkTransfer(txn.id, candidate.id);
      setLinkingId(null);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const header = ['Date', 'Description', 'Account', 'Category', 'Amount'];
    const rows = filtered.map(t => [t.date, t.raw_description, accountsById[t.account_id]?.name || '', t.category, t.amount.toFixed(2)]);
    const escape = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(() => {
    const nonTransfer = filtered.filter(t => !t.is_transfer);
    const income = nonTransfer.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const expense = Math.abs(nonTransfer.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));
    return { income, expense, net: income - expense };
  }, [filtered]);

  function checkForBulkApply(txn, category) {
    const matches = transactions.filter(t => t.id !== txn.id && t.raw_description === txn.raw_description && t.category !== category && !t.is_transfer);
    if (matches.length > 0) setPendingBulkApply({ pattern: txn.raw_description, category, count: matches.length });
  }

  async function handleRecategorize(txn, category) {
    setEditingCategoryId(null);
    setBusyId(txn.id);
    try {
      await updateTransaction(txn.id, { category });
      checkForBulkApply(txn, category);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateAndApply(txn) {
    const name = newCategoryForm.name.trim();
    if (!name) return;
    setBusyId(txn.id);
    try {
      await addCustomCategory(householdId, name, newCategoryForm.group || 'Other');
      await updateTransaction(txn.id, { category: name });
      setAddingCategoryForId(null);
      setNewCategoryForm({ name: '', group: 'Other' });
      checkForBulkApply(txn, name);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmBulkApply() {
    if (!pendingBulkApply) return;
    try {
      await setCategoryRule(householdId, pendingBulkApply.pattern, pendingBulkApply.category);
      await applyCategoryToMatching(householdId, pendingBulkApply.pattern, pendingBulkApply.category);
      setPendingBulkApply(null);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    }
  }

  async function handleRemoveCategoryRule(pattern) {
    try {
      await removeCategoryRule(householdId, pattern);
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    }
  }

  useEffect(() => { setSelectedIds(new Set()); }, [accountFilter, categoryFilter, period, customFrom, customTo, q, showTransfers, unmatchedOnly]);

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds(prev => {
      const allSelected = filtered.length > 0 && filtered.every(t => prev.has(t.id));
      return allSelected ? new Set() : new Set(filtered.map(t => t.id));
    });
  }

  async function handleBulkCategory() {
    if (!bulkCategoryChoice || selectedIds.size === 0) return;
    setBulkBusy(true);
    let failed = 0;
    for (const id of selectedIds) {
      try { await updateTransaction(id, { category: bulkCategoryChoice }); } catch { failed += 1; }
    }
    setSelectedIds(new Set());
    setBulkCategoryChoice('');
    await load();
    setBulkBusy(false);
    if (failed) toast(`${failed} transaction${failed === 1 ? '' : 's'} couldn't be recategorized.`, { error: true });
  }

  async function handleBulkAccount() {
    if (!bulkAccountChoice || selectedIds.size === 0) return;
    setBulkBusy(true);
    let failed = 0;
    for (const id of selectedIds) {
      try { await updateTransaction(id, { account_id: bulkAccountChoice }); } catch { failed += 1; }
    }
    setSelectedIds(new Set());
    setBulkAccountChoice('');
    await load();
    setBulkBusy(false);
    if (failed) toast(`${failed} transaction${failed === 1 ? '' : 's'} couldn't be moved - most likely an identical transaction already exists on that account.`, { error: true });
  }

  async function toggleReconciled(txn) {
    const isReconciled = (tags[txn.id] || []).includes('reconciled');
    setBusyId(txn.id);
    try {
      if (isReconciled) await removeTransactionTag(txn.id, 'reconciled');
      else await addTransactionTag(txn.id, 'reconciled');
      await load();
    } catch (err) {
      fail("Couldn't save that change", err);
    } finally {
      setBusyId(null);
    }
  }

  function startEditDetails(txn) {
    setEditingDetailsId(txn.id);
    setDetailsDraft({ raw_description: txn.raw_description, date: txn.date, amount: String(txn.amount), account_id: txn.account_id });
  }

  async function saveDetails(txn) {
    const amt = parseFloat(detailsDraft.amount);
    if (!detailsDraft.raw_description.trim() || !detailsDraft.date || Number.isNaN(amt)) return;
    setBusyId(txn.id);
    try {
      await updateTransaction(txn.id, {
        raw_description: detailsDraft.raw_description.trim(), date: detailsDraft.date, amount: amt, account_id: detailsDraft.account_id,
      });
      setEditingDetailsId(null);
      await load();
    } catch (err) {
      // The DB won't allow two identical (account, date, description, amount)
      // rows to coexist - if reassigning this transaction would collide with
      // one already on the target account, surface that plainly rather than
      // a raw constraint-violation message.
      if (err.message && err.message.includes('duplicate key')) {
        toast('An identical transaction already exists on that account - this looks like it may already be recorded there.', { error: true });
      } else {
        fail("Couldn't save that change", err);
      }
    } finally {
      setBusyId(null);
    }
  }

  // Everything (not just the filtered view) that still needs a decision.
  const uncategorizedCount = (transactions || []).filter(t => !t.is_transfer && t.category === 'Uncategorized').length;
  const needsYouTotal = uncategorizedCount + unmatchedTransfers.length;
  const needsYouLabel = `${needsYouTotal} transaction${needsYouTotal === 1 ? '' : 's'} need${needsYouTotal === 1 ? 's' : ''} you`;

  const activeFilterCount = [accountFilter !== 'all', categoryFilter !== 'all', period !== 'all', showTransfers, unmatchedOnly].filter(Boolean).length;

  if (error && !transactions) return <ErrorState message={`Couldn't load transactions: ${error}`} />;
  if (!transactions || !accounts) return <LoadingState label="Loading transactions…" />;

  // filtered is already newest-first, so consecutive rows with the same date form a day.
  const dayGroups = [];
  filtered.forEach(t => {
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.date === t.date) last.rows.push(t);
    else dayGroups.push({ date: t.date, rows: [t] });
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  const dayLabel = d => new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });

  function renderTxn(t) {
    const isReconciled = (tags[t.id] || []).includes('reconciled');
    const isEditingCat = editingCategoryId === t.id;
    const isAddingNewCat = addingCategoryForId === t.id;
    const isEditingDetails = editingDetailsId === t.id;
    const busy = busyId === t.id;
    const selected = selectedIds.has(t.id);
    const label = t.raw_description;
    return (
      <div key={t.id} className={`txn${selected ? ' is-selected' : ''}`}>
        {isEditingDetails ? (
          <form className="form-row" onSubmit={e => { e.preventDefault(); saveDetails(t); }}>
            <label className="field" style={{ flexBasis: 200 }}><span>Description</span>
              <input className="input" value={detailsDraft.raw_description} onChange={e => setDetailsDraft(d => ({ ...d, raw_description: e.target.value }))} autoFocus />
            </label>
            <label className="field"><span>Date</span>
              <input className="input" type="date" value={detailsDraft.date} onChange={e => setDetailsDraft(d => ({ ...d, date: e.target.value }))} />
            </label>
            <label className="field"><span>Amount</span>
              <input className="input" type="number" inputMode="decimal" value={detailsDraft.amount} onChange={e => setDetailsDraft(d => ({ ...d, amount: e.target.value }))} />
            </label>
            <label className="field"><span>Account</span>
              <select className="input" value={detailsDraft.account_id} onChange={e => setDetailsDraft(d => ({ ...d, account_id: e.target.value }))}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div className="toolbar">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditingDetailsId(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="txn-line">
            <input type="checkbox" checked={selected} onChange={() => toggleSelected(t.id)} aria-label={`Select ${label}`} />
            <div className="txn-main">
              <span className="txn-desc t-14">{label}</span>
              <div className="txn-meta">
                {isAddingNewCat ? (
                  <form className="toolbar" onSubmit={e => { e.preventDefault(); handleCreateAndApply(t); }}>
                    <label className="sr-only" htmlFor={`nc-${t.id}`}>New category name</label>
                    <input id={`nc-${t.id}`} className="input input-sm" autoFocus value={newCategoryForm.name} onChange={e => setNewCategoryForm(f => ({ ...f, name: e.target.value }))} placeholder="Category name" />
                    <label className="sr-only" htmlFor={`ng-${t.id}`}>Category group</label>
                    <input id={`ng-${t.id}`} className="input input-sm" style={{ width: 90 }} value={newCategoryForm.group} onChange={e => setNewCategoryForm(f => ({ ...f, group: e.target.value }))} placeholder="Group" />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Add</button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAddingCategoryForId(null)}>Cancel</button>
                  </form>
                ) : isEditingCat ? (
                  <>
                    <label className="sr-only" htmlFor={`cat-${t.id}`}>Category for {label}</label>
                    <select
                      id={`cat-${t.id}`}
                      className="input input-sm"
                      style={{ width: 'auto' }}
                      value={t.category}
                      autoFocus
                      onChange={e => {
                        if (e.target.value === '__new__') { setEditingCategoryId(null); setAddingCategoryForId(t.id); }
                        else handleRecategorize(t, e.target.value);
                      }}
                      onBlur={() => setEditingCategoryId(null)}
                    >
                      {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">+ New category…</option>
                    </select>
                  </>
                ) : t.is_transfer ? (
                  <span className="chip is-muted">{t.category}</span>
                ) : (
                  <button
                    type="button"
                    className={`chip ${t.category === 'Uncategorized' ? 'is-warn' : t.amount > 0 ? 'is-pos' : 'is-muted'}`}
                    onClick={() => setEditingCategoryId(t.id)}
                    aria-label={`Category: ${t.category}. Change category`}
                  >{t.category}</button>
                )}
                <span className="t-12 muted">{accountsById[t.account_id]?.name}</span>
                {t.needs_review && <span className="chip is-warn">Unmatched transfer</span>}
              </div>
            </div>
            <span className={`txn-amt t-14${t.is_transfer ? ' is-transfer' : t.amount > 0 ? ' pos' : ''}`}>{fmtCAD(t.amount)}</span>
            <div className="txn-actions">
              {t.is_transfer && t.needs_review && (
                <button type="button" className="btn btn-secondary btn-sm" aria-expanded={linkingId === t.id} onClick={() => setLinkingId(linkingId === t.id ? null : t.id)}>
                  {linkingId === t.id ? 'Cancel' : 'Link…'}
                </button>
              )}
              <button
                type="button"
                className="recon"
                aria-pressed={isReconciled}
                disabled={busy}
                onClick={() => toggleReconciled(t)}
                aria-label={isReconciled ? `Reconciled. Unmark ${label}` : `Mark ${label} as reconciled`}
                title={isReconciled ? 'Reconciled - click to unmark' : 'Mark as reconciled'}
              >{isReconciled && <IconCheck />}</button>
              <button type="button" className="btn-icon" onClick={() => startEditDetails(t)} aria-label={`Edit ${label}`} title="Edit description, date, amount or account"><IconPencil /></button>
            </div>
          </div>
        )}
        {linkingId === t.id && (
          <div className="inline-panel">
            <div className="t-12 muted">Link this to its matching transfer on another account:</div>
            {candidatesFor(t).length === 0 && <div className="t-14 muted">No other unmatched transfers to link to.</div>}
            {candidatesFor(t).map(c => (
              <div key={c.id} className="toolbar" style={{ justifyContent: 'space-between' }}>
                <span className="t-12">{accountsById[c.account_id]?.name} · {fmtDate(c.date)} · {c.raw_description} · <b>{fmtCAD(c.amount)}</b></span>
                <button type="button" className="btn btn-primary btn-sm" disabled={busyId === t.id} onClick={() => handleLink(t, c)}>Link</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`stack${selectedIds.size ? ' has-bulkbar' : ''}`}>
      <span className="t-14 muted" style={{ marginTop: -8 }}>{filtered.length} transaction{filtered.length === 1 ? '' : 's'} · {periodLabel}</span>

      <div className="toolbar" style={{ flexWrap: 'nowrap' }}>
        <label className="search">
          <IconSearch />
          <span className="sr-only">Search descriptions</span>
          <input type="search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary" aria-expanded={filtersOpen} aria-controls="txn-filters" onClick={() => setFiltersOpen(v => !v)}>
          <IconFilter /><span>Filters</span>
          {activeFilterCount > 0 && <span className="count-badge" aria-label={`${activeFilterCount} active`}>{activeFilterCount}</span>}
        </button>
      </div>

      <div className="segmented period-seg" role="group" aria-label="Period">
        {QUICK_PERIODS.map(p => (
          <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
      </div>

      {filtersOpen && (
        <section className="card" id="txn-filters" aria-label="Filters">
          <div className="filter-panel">
            <label className="field"><span>Account</span>
              <select className="input" value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
                <option value="all">All accounts</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Category</span>
              <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span>Period</span>
              <select className="input" value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="all">All time</option>
                {lastPaydayDate && <option value="pay_period">This pay period (since {fmtDate(lastPaydayDate)})</option>}
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="last_3_months">Last 3 months</option>
                <option value="last_6_months">Last 6 months</option>
                <option value="last_12_months">Last 12 months</option>
                <option value="ytd">Year to date</option>
                <option value="last_year">Last year ({Number(today.slice(0, 4)) - 1})</option>
                <option value="custom">Custom range…</option>
                {availableMonths.length > 0 && (
                  <optgroup label="Specific month">
                    {availableMonths.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            {period === 'custom' && (<>
              <label className="field"><span>From</span><input className="input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></label>
              <label className="field"><span>To</span><input className="input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></label>
            </>)}
          </div>
          <div className="toolbar" style={{ gap: 16 }}>
            <label className="check"><input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)} />Show internal transfers</label>
            <label className="check"><input type="checkbox" checked={unmatchedOnly} onChange={e => setUnmatchedOnly(e.target.checked)} />Unmatched transfers only{unmatchedTransfers.length ? ` (${unmatchedTransfers.length})` : ''}</label>
          </div>
        </section>
      )}

      <div className="stats">
        <div className="stat"><span className="t-12 caps muted">In</span><span className="stat-value pos">{fmtAbsCAD(totals.income)}</span></div>
        <div className="stat"><span className="t-12 caps muted">Out</span><span className="stat-value">{fmtAbsCAD(totals.expense)}</span></div>
        <div className="stat"><span className="t-12 caps muted">Net</span><span className={`stat-value ${totals.net < 0 ? 'neg' : 'pos'}`}>{fmtCAD(totals.net)}</span></div>
      </div>

      <div className="toolbar" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <label className="check" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} disabled={!filtered.length} />Select all</label>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-quiet btn-sm hide-wide" aria-expanded={breakdownOpen} onClick={() => setBreakdownOpen(v => !v)}>{breakdownOpen ? 'Hide breakdown' : 'Breakdown'}</button>
        <button type="button" className="btn btn-quiet btn-sm" aria-expanded={showManageCategories} onClick={() => setShowManageCategories(v => !v)}>Categories</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={exportCsv} title="Download the filtered list as CSV">Export</button>
      </div>

      <div className="split-layout">
      <aside className={`split-aside txn-aside${breakdownOpen ? ' is-open' : ''}`} aria-label="Summary">
        {(uncategorizedCount > 0 || unmatchedTransfers.length > 0) && (
          <div className="callout" style={{ '--c': 'var(--status-warn)' }}>
            <b className="t-14 semi">{needsYouLabel}</b>
            <span className="t-12 muted">
              {[uncategorizedCount > 0 && `${uncategorizedCount} without a category`, unmatchedTransfers.length > 0 && `${unmatchedTransfers.length} transfer${unmatchedTransfers.length === 1 ? '' : 's'} with no match`].filter(Boolean).join(' · ')}
            </span>
            <div className="toolbar" style={{ marginTop: 4 }}>
              {uncategorizedCount > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" aria-pressed={categoryFilter === 'Uncategorized'} onClick={() => { setUnmatchedOnly(false); setCategoryFilter(categoryFilter === 'Uncategorized' ? 'all' : 'Uncategorized'); }}>
                  {categoryFilter === 'Uncategorized' ? 'Show all' : 'Show uncategorized'}
                </button>
              )}
              {unmatchedTransfers.length > 0 && (
                <button type="button" className="btn btn-quiet btn-sm" aria-pressed={unmatchedOnly} onClick={() => { setCategoryFilter('all'); setUnmatchedOnly(v => !v); }}>
                  {unmatchedOnly ? 'Show all' : 'Show transfers'}
                </button>
              )}
            </div>
          </div>
        )}
        <section className="card breakdown" aria-labelledby="bd-h">
          <div className="card-head">
            <h2 className="t-16 semi" id="bd-h">Spending by category</h2>
            <span className="t-14 semi num">{fmtAbsCAD(categoryBreakdownTotal)}</span>
          </div>
          <div className="t-12 muted" style={{ marginTop: -8 }}>{periodLabel}{accountFilter !== 'all' ? ` · ${accountsById[accountFilter]?.name}` : ''}{q ? ` · "${q}"` : ''}</div>
          {categoryBreakdown.length === 0 ? <EmptyState label="No expenses in this range." /> : (
            <ul className="cats">
              {categoryBreakdown.map(([cat, amt]) => (
                <li key={cat} className="cat">
                  <div className="cat-line">
                    <span className="cat-name">
                      <button
                        type="button"
                        className={`chip ${cat === categoryFilter ? 'is-brand' : 'is-muted'}`}
                        aria-pressed={cat === categoryFilter}
                        onClick={() => setCategoryFilter(cat === categoryFilter ? 'all' : cat)}
                        title="Filter the list to this category"
                      >{cat}</button>
                    </span>
                    <span className="cat-amount t-14 semi">{fmtAbsCAD(amt)}</span>
                  </div>
                  <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min((amt / maxCategoryBreakdown) * 100, 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <div className="split-main stack">
      {showManageCategories && (
        <section className="card" aria-labelledby="mc-h">
          <h2 className="t-16 semi" id="mc-h" style={{ margin: 0 }}>Custom categories</h2>
          {customCategories.length === 0 ? (
            <div className="t-14 muted">None yet. Create one by recategorizing a transaction and choosing "+ New category".</div>
          ) : (
            <div className="toolbar">
              {customCategories.map(c => <span key={c.name} className="chip is-muted">{c.name} · {c.group_name}</span>)}
            </div>
          )}
          {categoryRules.length > 0 && (<>
            <h3 className="t-14 semi" style={{ margin: '8px 0 0' }}>Auto-apply rules</h3>
            {categoryRules.map(r => (
              <div key={r.pattern} className="toolbar" style={{ justifyContent: 'space-between' }}>
                <span className="t-14">Matching "{r.pattern}" → <strong>{r.category}</strong></span>
                <button type="button" className="btn btn-quiet btn-sm is-neg" onClick={() => handleRemoveCategoryRule(r.pattern)}>Remove</button>
              </div>
            ))}
          </>)}
        </section>
      )}

      {pendingBulkApply && (
        <section className="card is-info" role="status">
          <div className="t-14">
            Also apply <strong>{pendingBulkApply.category}</strong> to <strong>{pendingBulkApply.count}</strong> other "{pendingBulkApply.pattern}" transaction{pendingBulkApply.count === 1 ? '' : 's'}?
          </div>
          <div className="t-12 muted" style={{ marginTop: -8 }}>Future imports matching this will be categorized automatically too.</div>
          <div className="toolbar">
            <button type="button" className="btn btn-primary btn-sm" onClick={confirmBulkApply}>Apply to all {pendingBulkApply.count + 1}</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPendingBulkApply(null)}>Just this one</button>
          </div>
        </section>
      )}

      {filtered.length === 0 ? (
        <div className="card"><EmptyState label="No transactions match." /></div>
      ) : dayGroups.map(g => (
        <div key={g.date} className="day-group">
          <div className="day-label t-12 caps">{dayLabel(g.date)}</div>
          <div className="list-card">{g.rows.map(renderTxn)}</div>
        </div>
      ))}
      </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <span className="t-14 semi" style={{ marginRight: 'auto' }}>{selectedIds.size} selected</span>
          <label className="sr-only" htmlFor="bulk-cat">Set category</label>
          <select id="bulk-cat" value={bulkCategoryChoice} onChange={e => setBulkCategoryChoice(e.target.value)}>
            <option value="">Category…</option>
            {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-on-ink" disabled={!bulkCategoryChoice || bulkBusy} onClick={handleBulkCategory}>{bulkBusy ? 'Working…' : 'Apply'}</button>
          <label className="sr-only" htmlFor="bulk-acct">Move to account</label>
          <select id="bulk-acct" value={bulkAccountChoice} onChange={e => setBulkAccountChoice(e.target.value)}>
            <option value="">Move to…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-on-ink" disabled={!bulkAccountChoice || bulkBusy} onClick={handleBulkAccount}>{bulkBusy ? 'Working…' : 'Move'}</button>
          <button type="button" className="btn btn-sm btn-ghost-ink" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}
    </div>
  );
}
