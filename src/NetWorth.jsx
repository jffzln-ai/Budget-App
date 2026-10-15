import React, { useEffect, useState, useRef } from 'react';
import { getAccounts, getNetWorthItems, addNetWorthItem, removeNetWorthItem, computeLiveBalances, getAccountDeletionImpact, deleteAccount } from './lib/queries.js';
import { LoadingState, ErrorState } from './lib/states.jsx';
import { useToast } from './lib/toast.jsx';
import { useCountUp } from './lib/useCountUp.js';
import { AccountRow, DebtAwareAmount, Money, fmtCAD } from './lib/accounts.jsx';
import { IconMoreVertical, IconClose } from './lib/icons.jsx';

const NET_WORTH_CATEGORIES = {
  asset: ['Real Estate', 'Vehicle', 'RRSP (External)', 'Other Investment', 'Other Asset'],
  liability: ['Mortgage', 'Auto Loan', 'Personal Loan', 'Other Liability'],
};

function todayLabel() {
  return new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function NetWorth({ householdId, refreshKey = 0 }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [netWorthItems, setNetWorthItems] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'asset', category: 'Real Estate', value: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { account, impact } | null
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const nameRef = useRef(null);

  async function load() {
    try {
      const [accs, items] = await Promise.all([getAccounts(householdId), getNetWorthItems(householdId)]);
      setAccounts(accs);
      setNetWorthItems(items);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [householdId, refreshKey]);

  useEffect(() => {
    if (!menuFor) return;
    const close = e => { if (!e.target.closest('[data-row-menu]')) setMenuFor(null); };
    const esc = e => { if (e.key === 'Escape') setMenuFor(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menuFor]);

  useEffect(() => { if (formOpen) nameRef.current?.focus(); }, [formOpen]);

  async function handleAdd(e) {
    e.preventDefault();
    const val = parseFloat(form.value);
    if (!form.name.trim()) { setFormError('Give it a name.'); return; }
    if (Number.isNaN(val) || val < 0) { setFormError('Enter a value of $0 or more.'); return; }
    setFormError(null);
    setSaving(true);
    try {
      await addNetWorthItem(householdId, { name: form.name.trim(), type: form.type, category: form.category, value: val });
      setForm(f => ({ ...f, name: '', value: '' }));
      await load();
      toast(`Added ${form.name.trim()}`);
    } catch (err) {
      toast(`Couldn't add it: ${err.message}`, { error: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(item) {
    try {
      await removeNetWorthItem(item.id);
      await load();
      toast(`Removed ${item.name}`);
    } catch (err) {
      toast(`Couldn't remove ${item.name}: ${err.message}`, { error: true });
    }
  }

  async function startDeleteAccount(account) {
    setMenuFor(null);
    try {
      const impact = await getAccountDeletionImpact(account.id);
      setDeleteTarget({ account, impact });
      setConfirmText('');
    } catch (err) {
      toast(`Couldn't check what deleting ${account.name} affects: ${err.message}`, { error: true });
    }
  }

  async function confirmDeleteAccount() {
    if (!deleteTarget) return;
    const name = deleteTarget.account.name;
    setDeleteBusy(true);
    try {
      await deleteAccount(deleteTarget.account.id);
      setDeleteTarget(null);
      await load();
      toast(`Deleted ${name}`);
    } catch (err) {
      toast(`Couldn't delete ${name}: ${err.message}`, { error: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  const balances = accounts ? computeLiveBalances(accounts) : {};
  const accountAssetsTotal = (accounts || []).reduce((sum, a) => sum + Math.max(balances[a.id] || 0, 0), 0);
  const accountLiabilitiesTotal = Math.abs((accounts || []).reduce((sum, a) => sum + Math.min(balances[a.id] || 0, 0), 0));
  const manualAssetsTotal = netWorthItems.filter(i => i.type === 'asset').reduce((sum, i) => sum + i.value, 0);
  const manualLiabilitiesTotal = netWorthItems.filter(i => i.type === 'liability').reduce((sum, i) => sum + i.value, 0);
  const totalAssets = accountAssetsTotal + manualAssetsTotal;
  const totalLiabilities = accountLiabilitiesTotal + manualLiabilitiesTotal;
  const netWorth = totalAssets - totalLiabilities;
  const shownNet = useCountUp(accounts ? netWorth : null);

  if (error && !accounts) return <ErrorState message={`Couldn't load net worth: ${error}`} />;
  if (!accounts) return <LoadingState />;

  const assetShare = totalAssets + totalLiabilities > 0 ? (totalAssets / (totalAssets + totalLiabilities)) * 100 : 0;

  return (
    <div className="stack">
      <span className="t-14 muted" style={{ marginTop: -8 }}>As of {todayLabel()}</span>

      <section className="hero" aria-labelledby="nw-label">
        <span className="t-12 caps hero-soft" id="nw-label">Assets less liabilities</span>
        <span className="hero-value t-44 display">{fmtCAD(shownNet)}</span>
        <div className="split" aria-hidden="true"><i style={{ width: `${assetShare}%` }} /></div>
        <div className="hero-legend t-12 hero-soft">
          <span>Assets <b><Money value={totalAssets} /></b></span>
          <span>Owed <b><Money value={totalLiabilities} /></b></span>
        </div>
        {netWorth < 0 && <span className="chip is-neg" style={{ alignSelf: 'flex-start' }}>You owe more than you own</span>}
      </section>

      <section className="card is-compact is-grouped" aria-labelledby="nw-accounts">
        <div className="card-head">
          <h2 className="t-14 semi" id="nw-accounts">Accounts</h2>
          <span className="t-12 muted">{accounts.length}</span>
        </div>
        <ul className="rows is-compact">
          {accounts.map(a => (
            <AccountRow
              key={a.id}
              account={a}
              balance={balances[a.id]}
              trailing={<>
                <div className="menu-anchor" data-row-menu>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`More actions for ${a.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menuFor === a.id}
                    onClick={() => setMenuFor(menuFor === a.id ? null : a.id)}
                  ><IconMoreVertical /></button>
                  {menuFor === a.id && (
                    <div className="menu" role="menu">
                      <button type="button" role="menuitem" className="is-neg" onClick={() => startDeleteAccount(a)}>Delete account…</button>
                    </div>
                  )}
                </div>
                {deleteTarget && deleteTarget.account.id === a.id && (
                  <div className="inline-panel is-danger" style={{ flexBasis: '100%', margin: '4px 8px 8px' }} role="alertdialog" aria-labelledby={`del-${a.id}`}>
                    <div className="t-14 semi neg" id={`del-${a.id}`}>Delete "{a.name}" permanently?</div>
                    <div className="t-14">
                      This will permanently delete <strong>{deleteTarget.impact.transactions}</strong> transaction{deleteTarget.impact.transactions === 1 ? '' : 's'}
                      {deleteTarget.impact.plannedTransactions > 0 && <> and <strong>{deleteTarget.impact.plannedTransactions}</strong> planned expense{deleteTarget.impact.plannedTransactions === 1 ? '' : 's'}</>}
                      {deleteTarget.impact.recurringRules > 0 && <>, and remove <strong>{deleteTarget.impact.recurringRules}</strong> recurring bill{deleteTarget.impact.recurringRules === 1 ? '' : 's'} tracked on this account</>}.
                      {a.plaid_item_id && <> This account is connected via Plaid - future syncs for it will stop once it's deleted.</>}
                      {' '}This cannot be undone.
                    </div>
                    <label className="field">
                      <span>Type <strong>{a.name}</strong> to confirm</span>
                      <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoFocus />
                    </label>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: 'var(--neg)', color: 'var(--s1)' }}
                        disabled={confirmText !== a.name || deleteBusy}
                        onClick={confirmDeleteAccount}
                      >{deleteBusy ? 'Deleting…' : 'Delete permanently'}</button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </>}
            />
          ))}
        </ul>
      </section>

      <section className="card is-compact" aria-labelledby="nw-other">
        <div className="card-head">
          <h2 className="t-14 semi" id="nw-other">Other assets &amp; liabilities</h2>
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={formOpen} onClick={() => setFormOpen(v => !v)}>{formOpen ? 'Close' : 'Add'}</button>
        </div>
        {netWorthItems.length === 0 && !formOpen && (
          <div className="t-14 muted">Nothing added yet. Add real estate, vehicles, external RRSPs, loans, or anything that isn't already a tracked account.</div>
        )}
        {netWorthItems.length > 0 && (
          <ul className="rows is-compact">
            {netWorthItems.map(item => (
              <li key={item.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div className="row" style={{ cursor: 'default', flex: 1, minWidth: 0 }}>
                  <span className="row-main">
                    <span className="row-title t-14 semi">{item.name}</span>
                    <span className="row-sub t-12 muted">{item.category}</span>
                  </span>
                  <DebtAwareAmount value={item.type === 'liability' ? -item.value : item.value} isDebt={item.type === 'liability'} />
                </div>
                <button type="button" className="btn-icon" aria-label={`Remove ${item.name}`} onClick={() => handleRemove(item)}><IconClose /></button>
              </li>
            ))}
          </ul>
        )}
        {formOpen && (
          <form className="inline-panel" onSubmit={handleAdd} noValidate>
            <div className="form-row">
              <label className="field"><span>Name</span><input ref={nameRef} className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Honda Civic" /></label>
              <label className="field"><span>Type</span>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, category: NET_WORTH_CATEGORIES[e.target.value][0] }))}>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                </select>
              </label>
              <label className="field"><span>Category</span>
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {NET_WORTH_CATEGORIES[form.type].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field"><span>Value</span><input className="input" type="number" inputMode="decimal" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="$" /></label>
            </div>
            {formError && <div className="field-error" role="alert">{formError}</div>}
            <div className="toolbar">
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
