import React, { useEffect, useState, useMemo } from 'react';
import {
  getAccounts, getAllTransactions, getTransactionTags,
  updateTransaction, addTransactionTag, removeTransactionTag,
  getCustomCategories, addCustomCategory, getCategoryRules, setCategoryRule, removeCategoryRule, applyCategoryToMatching,
  linkTransfer,
} from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';
import { IconTrendingUp, IconTrendingDown } from './lib/icons.jsx';

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
  card: { background: 'var(--card)', borderRadius: 20, boxShadow: '0 1px 3px rgba(27,33,29,0.04)' },
  field: { padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: 'var(--card)' },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  smallBtn: { background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' },
  primaryBtn: { background: 'var(--pine)', color: 'var(--hero-text)', border: 'none', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
};
const PINE_SOFT = 'var(--pine-soft)';
const CREAM_TINT = 'var(--cream-tint)';

function todayIso() { return new Date().toISOString().slice(0, 10); }
function ymKey(date) { return date.slice(0, 7); }
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

export default function Transactions({ householdId, initialAccountFilter, onConsumeInitialFilter }) {
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [tags, setTags] = useState({});
  const [customCategories, setCustomCategories] = useState([]);
  const [categoryRules, setCategoryRules] = useState([]);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [period, setPeriod] = useState('all');
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
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [householdId]);

  useEffect(() => {
    if (initialAccountFilter) {
      setAccountFilter(initialAccountFilter);
      if (onConsumeInitialFilter) onConsumeInitialFilter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccountFilter]);

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

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter(t => accountFilter === 'all' || t.account_id === accountFilter)
      .filter(t => unmatchedOnly ? (t.is_transfer && t.needs_review) : (showTransfers || !t.is_transfer))
      .filter(t => !q || t.raw_description.toLowerCase().includes(q.toLowerCase()))
      .filter(t => {
        if (period === 'all') return true;
        if (period === 'pay_period') return lastPaydayDate && t.date >= lastPaydayDate;
        return ymKey(t.date) === period;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [transactions, accountFilter, showTransfers, unmatchedOnly, q, period, lastPaydayDate]);

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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
    }
  }

  async function handleRemoveCategoryRule(pattern) {
    try {
      await removeCategoryRule(householdId, pattern);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { setSelectedIds(new Set()); }, [accountFilter, period, q, showTransfers, unmatchedOnly]);

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
    if (failed) setError(`${failed} transaction${failed === 1 ? '' : 's'} couldn't be recategorized.`);
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
    if (failed) setError(`${failed} transaction${failed === 1 ? '' : 's'} couldn't be moved - most likely an identical transaction already exists on that account.`);
  }

  async function toggleReconciled(txn) {
    const isReconciled = (tags[txn.id] || []).includes('reconciled');
    setBusyId(txn.id);
    try {
      if (isReconciled) await removeTransactionTag(txn.id, 'reconciled');
      else await addTransactionTag(txn.id, 'reconciled');
      await load();
    } catch (err) {
      setError(err.message);
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
        setError('An identical transaction already exists on that account - this looks like it may already be recorded there.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusyId(null);
    }
  }

  const activeFilterCount = [accountFilter !== 'all', period !== 'all', showTransfers, unmatchedOnly].filter(Boolean).length;

  if (error) return <ErrorState message={`Couldn't load transactions: ${error}`} />;
  if (!transactions || !accounts) return <LoadingState label="Loading transactions…" />;

  return (
    <div style={s.card}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input style={{ ...s.field, flex: 1 }} placeholder="Search description…" value={q} onChange={e => setQ(e.target.value)} />
          <button
            onClick={() => setFiltersOpen(v => !v)}
            style={{
              ...s.smallBtn, display: 'flex', alignItems: 'center', gap: 6,
              background: filtersOpen ? 'var(--cream-tint)' : 'none',
            }}
          >
            Filters
            {activeFilterCount > 0 && (
              <span style={{ background: 'var(--pine)', color: 'var(--hero-text)', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div style={{ marginTop: 12, padding: 14, background: 'var(--cream-tint)', borderRadius: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={s.field} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
              <option value="all">All accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select style={s.field} value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="all">All time</option>
              {lastPaydayDate && <option value="pay_period">This pay period (since {fmtDate(lastPaydayDate)})</option>}
              {availableMonths.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
            </select>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)} />
              Show internal transfers
            </label>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={unmatchedOnly} onChange={e => setUnmatchedOnly(e.target.checked)} />
              Unmatched transfers only{unmatchedTransfers.length ? ` (${unmatchedTransfers.length})` : ''}
            </label>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</div>
          <button onClick={() => setShowManageCategories(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Manage categories</button>
          <button onClick={exportCsv} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', marginLeft: 'auto' }}>Export CSV</button>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: CREAM_TINT }}>
        <label style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))} onChange={toggleSelectAllVisible} />
          Select all
        </label>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 8px', borderRadius: 999, background: 'var(--pine-soft)' }}>
            <IconTrendingUp color="var(--pine)" />
            <span style={{ ...s.num, fontSize: 12, fontWeight: 700, color: 'var(--pine)' }}>${totals.income.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 8px', borderRadius: 999, background: 'var(--line-soft)' }}>
            <IconTrendingDown color="var(--ink)" />
            <span style={{ ...s.num, fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>${totals.expense.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: totals.net < 0 ? 'rgba(156,74,52,0.14)' : 'var(--pine-soft)' }}>
            <span style={{ ...s.num, fontSize: 12, fontWeight: 700, color: totals.net < 0 ? 'var(--rust)' : 'var(--pine)' }}>Net {fmtCAD(totals.net)}</span>
          </span>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ padding: 14, borderBottom: '1px solid var(--line)', background: PINE_SOFT, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{selectedIds.size} selected</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select style={s.field} value={bulkCategoryChoice} onChange={e => setBulkCategoryChoice(e.target.value)}>
              <option value="">Set category to…</option>
              {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button style={s.primaryBtn} disabled={!bulkCategoryChoice || bulkBusy} onClick={handleBulkCategory}>{bulkBusy ? '…' : 'Apply'}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select style={s.field} value={bulkAccountChoice} onChange={e => setBulkAccountChoice(e.target.value)}>
              <option value="">Move to account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button style={s.primaryBtn} disabled={!bulkAccountChoice || bulkBusy} onClick={handleBulkAccount}>{bulkBusy ? '…' : 'Apply'}</button>
          </div>
          <button style={s.smallBtn} onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}

      {showManageCategories && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--line)', background: CREAM_TINT }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Custom categories</div>
          {customCategories.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>None yet - create one by recategorizing a transaction and choosing "+ New category".</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: categoryRules.length ? 16 : 0 }}>
            {customCategories.map(c => (
              <span key={c.name} style={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '3px 8px' }}>
                {c.name} <span style={{ color: 'var(--ink-soft)' }}>· {c.group_name}</span>
              </span>
            ))}
          </div>
          {categoryRules.length > 0 && (<>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Auto-apply rules</div>
            {categoryRules.map(r => (
              <div key={r.pattern} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                <span>Transactions matching "{r.pattern}" → <strong>{r.category}</strong></span>
                <button style={s.smallBtn} onClick={() => handleRemoveCategoryRule(r.pattern)}>Remove</button>
              </div>
            ))}
          </>)}
        </div>
      )}

      {pendingBulkApply && (
        <div style={{ padding: 14, borderBottom: '1px solid var(--line)', background: PINE_SOFT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13 }}>
            Also apply <strong>{pendingBulkApply.category}</strong> to <strong>{pendingBulkApply.count}</strong> other "{pendingBulkApply.pattern}" transaction{pendingBulkApply.count === 1 ? '' : 's'}?
            <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}> — future imports matching this will apply automatically too.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={s.primaryBtn} onClick={confirmBulkApply}>Apply to all {pendingBulkApply.count + 1}</button>
            <button style={s.smallBtn} onClick={() => setPendingBulkApply(null)}>Just this one</button>
          </div>
        </div>
      )}

      <div>
        {filtered.map(t => {
          const isReconciled = (tags[t.id] || []).includes('reconciled');
          const isEditingCat = editingCategoryId === t.id;
          const isAddingNewCat = addingCategoryForId === t.id;
          const isEditingDetails = editingDetailsId === t.id;
          const busy = busyId === t.id;
          return (
            <div key={t.id} style={{
              padding: '10px 16px', borderBottom: '1px solid var(--line)',
              borderLeft: `3px solid ${t.is_transfer ? 'var(--line)' : t.amount > 0 ? 'var(--pine)' : 'transparent'}`,
            }}>
              {isEditingDetails ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Description</div>
                    <input style={{ ...s.field, width: '100%' }} value={detailsDraft.raw_description} onChange={e => setDetailsDraft(d => ({ ...d, raw_description: e.target.value }))} autoFocus />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Date</div>
                    <input style={s.field} type="date" value={detailsDraft.date} onChange={e => setDetailsDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Amount</div>
                    <input style={{ ...s.field, width: 90 }} type="number" value={detailsDraft.amount} onChange={e => setDetailsDraft(d => ({ ...d, amount: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Account</div>
                    <select style={s.field} value={detailsDraft.account_id} onChange={e => setDetailsDraft(d => ({ ...d, account_id: e.target.value }))}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <button style={s.primaryBtn} disabled={busy} onClick={() => saveDetails(t)}>{busy ? 'Saving…' : 'Save'}</button>
                  <button style={s.smallBtn} onClick={() => setEditingDetailsId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      style={{ flexShrink: 0 }}
                    />
                    <button
                      onClick={() => !busy && toggleReconciled(t)}
                      title={isReconciled ? 'Reconciled - click to unmark' : 'Mark as reconciled'}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, fontSize: 16, color: isReconciled ? 'var(--pine)' : 'var(--line)' }}
                    >●</button>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>{t.raw_description}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{fmtDate(t.date)}</span><span>·</span><span>{accountsById[t.account_id]?.name}</span><span>·</span>
                        {isAddingNewCat ? (
                          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input style={{ ...s.field, fontSize: 11, padding: '1px 4px', width: 110 }} autoFocus value={newCategoryForm.name} onChange={e => setNewCategoryForm(f => ({ ...f, name: e.target.value }))} placeholder="category name" />
                            <input style={{ ...s.field, fontSize: 11, padding: '1px 4px', width: 80 }} value={newCategoryForm.group} onChange={e => setNewCategoryForm(f => ({ ...f, group: e.target.value }))} placeholder="group" />
                            <button style={s.primaryBtn} onClick={() => handleCreateAndApply(t)}>Add</button>
                            <button style={s.smallBtn} onClick={() => setAddingCategoryForId(null)}>Cancel</button>
                          </span>
                        ) : isEditingCat ? (
                          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <select
                              style={{ ...s.field, fontSize: 11, padding: '1px 4px' }} value={t.category} autoFocus
                              onChange={e => {
                                if (e.target.value === '__new__') { setEditingCategoryId(null); setAddingCategoryForId(t.id); }
                                else handleRecategorize(t, e.target.value);
                              }}
                              onBlur={() => setEditingCategoryId(null)}
                            >
                              {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="__new__">+ New category…</option>
                            </select>
                          </span>
                        ) : (
                          <span
                            onClick={() => !t.is_transfer && setEditingCategoryId(t.id)}
                            style={{ cursor: t.is_transfer ? 'default' : 'pointer', textDecoration: t.is_transfer ? 'none' : 'underline dotted', textDecorationColor: 'var(--ink-soft)' }}
                          >{t.category}</span>
                        )}
                        {t.needs_review && <span style={{ color: 'var(--rust)' }}>· unmatched transfer</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ ...s.num, fontSize: 14, fontWeight: 600, color: t.amount < 0 ? 'var(--ink)' : 'var(--pine)' }}>{fmtCAD(t.amount)}</span>
                    {t.is_transfer && t.needs_review && (
                      <button style={s.smallBtn} onClick={() => setLinkingId(linkingId === t.id ? null : t.id)}>{linkingId === t.id ? 'Cancel' : 'Link…'}</button>
                    )}
                    <button style={s.smallBtn} onClick={() => startEditDetails(t)} title="Edit description, date, or amount">Edit</button>
                  </div>
                </div>
              )}
              {linkingId === t.id && (
                <div style={{ marginTop: 8, padding: 10, background: CREAM_TINT, border: '1px solid var(--line)', borderRadius: 12 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6 }}>Link this to its matching transfer on another account:</div>
                  {candidatesFor(t).length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No other unmatched transfers to link to.</div>}
                  {candidatesFor(t).map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                      <span>{accountsById[c.account_id]?.name} · {fmtDate(c.date)} · {c.raw_description} · <span style={s.num}>{fmtCAD(c.amount)}</span></span>
                      <button style={s.primaryBtn} disabled={busyId === t.id} onClick={() => handleLink(t, c)}>Link</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-soft)' }}>No transactions match.</div>}
      </div>
    </div>
  );
}
