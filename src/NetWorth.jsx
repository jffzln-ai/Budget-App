import React, { useEffect, useState } from 'react';
import { getAccounts, getNetWorthItems, addNetWorthItem, removeNetWorthItem, computeLiveBalances } from './lib/queries.js';

const NET_WORTH_CATEGORIES = {
  asset: ['Real Estate', 'Vehicle', 'RRSP (External)', 'Other Investment', 'Other Asset'],
  liability: ['Mortgage', 'Auto Loan', 'Personal Loan', 'Other Liability'],
};

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const s = {
  card: { background: '#FFFFFF', borderRadius: 20, padding: 22, boxShadow: '0 1px 3px rgba(27,33,29,0.04)' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8477', marginBottom: 8 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  field: { padding: '7px 10px', border: '1px solid #E3DECF', borderRadius: 8, fontSize: 13, background: '#fff' },
  btn: { background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
};
const PINE = '#1F4D3D';
const RUST = '#9C4A34';

export default function NetWorth({ householdId }) {
  const [accounts, setAccounts] = useState(null);
  const [netWorthItems, setNetWorthItems] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'asset', category: 'Real Estate', value: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [accs, items] = await Promise.all([getAccounts(householdId), getNetWorthItems(householdId)]);
      setAccounts(accs);
      setNetWorthItems(items);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [householdId]);

  async function handleAdd() {
    const val = parseFloat(form.value);
    if (!form.name.trim() || Number.isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await addNetWorthItem(householdId, { name: form.name.trim(), type: form.type, category: form.category, value: val });
      setForm({ ...form, name: '', value: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id) {
    try {
      await removeNetWorthItem(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div style={{ color: '#9C4A34' }}>{error}</div>;
  if (!accounts) return <div style={{ color: '#6B7268' }}>Loading…</div>;

  const balances = computeLiveBalances(accounts);
  const accountAssetsTotal = accounts.reduce((sum, a) => sum + Math.max(balances[a.id] || 0, 0), 0);
  const accountLiabilitiesTotal = Math.abs(accounts.reduce((sum, a) => sum + Math.min(balances[a.id] || 0, 0), 0));
  const manualAssetsTotal = netWorthItems.filter(i => i.type === 'asset').reduce((sum, i) => sum + i.value, 0);
  const manualLiabilitiesTotal = netWorthItems.filter(i => i.type === 'liability').reduce((sum, i) => sum + i.value, 0);
  const totalAssets = accountAssetsTotal + manualAssetsTotal;
  const totalLiabilities = accountLiabilitiesTotal + manualLiabilitiesTotal;
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 14 }}>
        <div style={s.label}>Net worth</div>
        <div style={{ ...s.num, fontSize: 38, fontWeight: 700, color: netWorth < 0 ? RUST : PINE }}>{fmtCAD(netWorth)}</div>
        <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#8A8477', fontWeight: 600 }}>Total assets</div>
            <div style={{ ...s.num, fontSize: 19, fontWeight: 700, color: PINE, marginTop: 2 }}>{fmtCAD(totalAssets)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8A8477', fontWeight: 600 }}>Total liabilities</div>
            <div style={{ ...s.num, fontSize: 19, fontWeight: 700, color: RUST, marginTop: 2 }}>{fmtCAD(totalLiabilities)}</div>
          </div>
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 14 }}>
        <div style={s.label}>Accounts</div>
        {accounts.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #F0ECE2', fontSize: 13 }}>
            <span>{a.name}</span>
            <span style={{ ...s.num, fontWeight: 600, color: (balances[a.id] || 0) < 0 ? RUST : '#1B211D' }}>{fmtCAD(balances[a.id])}</span>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={s.label}>Other assets & liabilities</div>
        {netWorthItems.length === 0 && <div style={{ fontSize: 13, color: '#6B7268', marginBottom: 12 }}>Nothing added yet - real estate, vehicles, external RRSPs, loans, anything not already one of your tracked accounts.</div>}
        {netWorthItems.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #F0ECE2' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: '#8A8477' }}>{item.category}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...s.num, fontWeight: 700, color: item.type === 'liability' ? RUST : PINE }}>{item.type === 'liability' ? '−' : ''}{fmtCAD(item.value)}</span>
              <button onClick={() => handleRemove(item.id)} style={{ background: 'none', border: 'none', color: '#8A8477', cursor: 'pointer', fontSize: 12 }}>Remove</button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
          <div><div style={{ fontSize: 11, color: '#8A8477', marginBottom: 3 }}>Name</div><input style={s.field} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Honda Civic" /></div>
          <div><div style={{ fontSize: 11, color: '#8A8477', marginBottom: 3 }}>Type</div>
            <select style={s.field} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, category: NET_WORTH_CATEGORIES[e.target.value][0] }))}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
          </div>
          <div><div style={{ fontSize: 11, color: '#8A8477', marginBottom: 3 }}>Category</div>
            <select style={s.field} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {NET_WORTH_CATEGORIES[form.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><div style={{ fontSize: 11, color: '#8A8477', marginBottom: 3 }}>Value</div><input style={{ ...s.field, width: 100 }} type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="$" /></div>
          <button style={s.btn} disabled={saving} onClick={handleAdd}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}
