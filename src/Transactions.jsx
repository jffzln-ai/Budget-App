import React, { useEffect, useState, useMemo } from 'react';
import {
  getAccounts, getAllTransactions, getTransactionTags,
  updateTransaction, addTransactionTag, removeTransactionTag,
  getCustomCategories, addCustomCategory, getCategoryRules, setCategoryRule, removeCategoryRule, applyCategoryToMatching,
  linkTransfer,
} from './lib/queries.js';

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
  card: { background: '#F8F6F0', borderRadius: 8 },
  field: { padding: '7px 10px', border: '1px solid #E3DECF', borderRadius: 4, fontSize: 13, background: '#fff' },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  smallBtn: { background: 'none', border: '1px solid #E3DECF', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#1B211D' },
  primaryBtn: { background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function ymKey(date) { return date.slice(0, 7); }
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

export default function Transactions({ householdId }) {
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
  const [editingDetailsId, setEditingDetailsId] = useState(null);
  const [detailsDraft, setDetailsDraft] = useState({ raw_description: '', date: '', amount: '' });
  const [busyId, setBusyId] = useState(null);

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
    setDetailsDraft({ raw_description: txn.raw_description, date: txn.date, amount: String(txn.amount) });
  }

  async function saveDetails(txn) {
    const amt = parseFloat(detailsDraft.amount);
    if (!detailsDraft.raw_description.trim() || !detailsDraft.date || Number.isNaN(amt)) return;
    setBusyId(txn.id);
    try {
      await updateTransaction(txn.id, { raw_description: detailsDraft.raw_description.trim(), date: detailsDraft.date, amount: amt });
      setEditingDetailsId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div style={{ color: '#9C4A34' }}>Couldn't load transactions: {error}</div>;
  if (!transactions || !accounts) return <div style={{ color: '#6B7268' }}>Loading transactions…</div>;

  return (
    <div style={s.card}>
      <div style={{ padding: 16, borderBottom: '1px solid #E3DECF', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...s.field, flex: '1 1 200px' }} placeholder="Search description…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={s.field} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select style={s.field} value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">All time</option>
          {lastPaydayDate && <option value="pay_period">This pay period (since {fmtDate(lastPaydayDate)})</option>}
          {availableMonths.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
        </select>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, color: '#6B7268' }}>
          <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)} />
          Show internal transfers
        </label>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, color: '#6B7268' }}>
          <input type="checkbox" checked={unmatchedOnly} onChange={e => setUnmatchedOnly(e.target.checked)} />
          Unmatched transfers only{unmatchedTransfers.length ? ` (${unmatchedTransfers.length})` : ''}
        </label>
        <button style={s.smallBtn} onClick={() => setShowManageCategories(v => !v)}>Manage categories</button>
        <button style={s.smallBtn} onClick={exportCsv}>Export CSV</button>
        <div style={{ fontSize: 12, color: '#6B7268', marginLeft: 'auto' }}>{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</div>
      </div>

      <div style={{ padding: '10px 16px', borderBottom: '1px solid #E3DECF', display: 'flex', gap: 18, alignItems: 'baseline', background: '#FCFBF8' }}>
        <span style={{ fontSize: 12, color: '#6B7268' }}>In: <span style={{ ...s.num, color: '#1F4D3D', fontWeight: 600 }}>${totals.income.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
        <span style={{ fontSize: 12, color: '#6B7268' }}>Out: <span style={{ ...s.num, color: '#1B211D', fontWeight: 600 }}>${totals.expense.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
        <span style={{ fontSize: 12, color: '#6B7268' }}>Net: <span style={{ ...s.num, fontWeight: 700, color: totals.net < 0 ? '#9C4A34' : '#1F4D3D' }}>{fmtCAD(totals.net)}</span></span>
      </div>

      {showManageCategories && (
        <div style={{ padding: 16, borderBottom: '1px solid #E3DECF', background: '#FCFBF8' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Custom categories</div>
          {customCategories.length === 0 && <div style={{ fontSize: 12.5, color: '#6B7268', marginBottom: 10 }}>None yet - create one by recategorizing a transaction and choosing "+ New category".</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: categoryRules.length ? 16 : 0 }}>
            {customCategories.map(c => (
              <span key={c.name} style={{ fontSize: 12, background: '#fff', border: '1px solid #E3DECF', borderRadius: 4, padding: '3px 8px' }}>
                {c.name} <span style={{ color: '#6B7268' }}>· {c.group_name}</span>
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
        <div style={{ padding: 14, borderBottom: '1px solid #E3DECF', background: '#F1F5F1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13 }}>
            Also apply <strong>{pendingBulkApply.category}</strong> to <strong>{pendingBulkApply.count}</strong> other "{pendingBulkApply.pattern}" transaction{pendingBulkApply.count === 1 ? '' : 's'}?
            <span style={{ color: '#6B7268', fontSize: 11.5 }}> — future imports matching this will apply automatically too.</span>
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
            <div key={t.id} style={{ padding: '10px 16px', borderBottom: '1px solid #E3DECF' }}>
              {isEditingDetails ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 10, color: '#6B7268' }}>Description</div>
                    <input style={{ ...s.field, width: '100%' }} value={detailsDraft.raw_description} onChange={e => setDetailsDraft(d => ({ ...d, raw_description: e.target.value }))} autoFocus />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#6B7268' }}>Date</div>
                    <input style={s.field} type="date" value={detailsDraft.date} onChange={e => setDetailsDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#6B7268' }}>Amount</div>
                    <input style={{ ...s.field, width: 90 }} type="number" value={detailsDraft.amount} onChange={e => setDetailsDraft(d => ({ ...d, amount: e.target.value }))} />
                  </div>
                  <button style={s.primaryBtn} disabled={busy} onClick={() => saveDetails(t)}>{busy ? 'Saving…' : 'Save'}</button>
                  <button style={s.smallBtn} onClick={() => setEditingDetailsId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <button
                      onClick={() => !busy && toggleReconciled(t)}
                      title={isReconciled ? 'Reconciled - click to unmark' : 'Mark as reconciled'}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, fontSize: 16, color: isReconciled ? '#1F4D3D' : '#E3DECF' }}
                    >●</button>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>{t.raw_description}</div>
                      <div style={{ fontSize: 11, color: '#6B7268', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
                            style={{ cursor: t.is_transfer ? 'default' : 'pointer', textDecoration: t.is_transfer ? 'none' : 'underline dotted', textDecorationColor: '#6B7268' }}
                          >{t.category}</span>
                        )}
                        {t.needs_review && <span style={{ color: '#9C4A34' }}>· unmatched transfer</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ ...s.num, fontSize: 14, fontWeight: 600, color: t.amount < 0 ? '#1B211D' : '#1F4D3D' }}>{fmtCAD(t.amount)}</span>
                    {t.is_transfer && t.needs_review && (
                      <button style={s.smallBtn} onClick={() => setLinkingId(linkingId === t.id ? null : t.id)}>{linkingId === t.id ? 'Cancel' : 'Link…'}</button>
                    )}
                    <button style={s.smallBtn} onClick={() => startEditDetails(t)} title="Edit description, date, or amount">Edit</button>
                  </div>
                </div>
              )}
              {linkingId === t.id && (
                <div style={{ marginTop: 8, padding: 10, background: '#FCFBF8', border: '1px solid #E3DECF', borderRadius: 4 }}>
                  <div style={{ fontSize: 11.5, color: '#6B7268', marginBottom: 6 }}>Link this to its matching transfer on another account:</div>
                  {candidatesFor(t).length === 0 && <div style={{ fontSize: 12, color: '#6B7268' }}>No other unmatched transfers to link to.</div>}
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
        {filtered.length === 0 && <div style={{ padding: 24, fontSize: 13, color: '#6B7268' }}>No transactions match.</div>}
      </div>
    </div>
  );
}
