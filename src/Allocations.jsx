import React, { useEffect, useState } from 'react';
import { getAccounts, getAllTransactions, getNetWorthItems, addNetWorthItem, removeNetWorthItem, computeLiveBalances } from './lib/queries.js';

const NET_WORTH_CATEGORIES = {
  asset: ['Real Estate', 'Vehicle', 'RRSP (External)', 'Other Investment', 'Other Asset'],
  liability: ['Mortgage', 'Auto Loan', 'Personal Loan', 'Other Liability'],
};

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const s = {
  card: { background: '#F8F6F0', borderRadius: 8, padding: 20 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7268', marginBottom: 8 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  field: { padding: '7px 10px', border: '1px solid #E3DECF', borderRadius: 4, fontSize: 13, background: '#fff' },
  btn: { background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
};

function ymKey(date) { return date.slice(0, 7); }
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

export default function Allocations({ householdId }) {
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [netWorthItems, setNetWorthItems] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'asset', category: 'Real Estate', value: '' });
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState('all');

  async function load() {
    try {
      const [accs, txns, items] = await Promise.all([getAccounts(householdId), getAllTransactions(householdId), getNetWorthItems(householdId)]);
      setAccounts(accs);
      setTransactions(txns);
      setNetWorthItems(items);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [householdId]);

  if (error) return <div style={{ color: '#9C4A34' }}>{error}</div>;
  if (!accounts || !transactions) return <div style={{ color: '#6B7268' }}>Loading…</div>;

  const savingsAccounts = accounts.filter(a => a.type === 'savings');
  const tfsa = accounts.find(a => a.type === 'investment');
  const balances = computeLiveBalances(accounts);

  const savingsIds = new Set(savingsAccounts.map(a => a.id));
  const availableMonths = Array.from(new Set(transactions.filter(t => savingsIds.has(t.account_id)).map(t => ymKey(t.date)))).sort().reverse();

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <select style={s.field} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {availableMonths.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
        {savingsAccounts.map(a => {
          const accTxns = transactions
            .filter(t => t.account_id === a.id)
            .filter(t => month === 'all' || ymKey(t.date) === month)
            .sort((x, y) => y.date.localeCompare(x.date));
          const balance = balances[a.id];
          const inflow = accTxns.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
          const outflow = Math.abs(accTxns.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));
          return (
            <div key={a.id} style={s.card}>
              <div style={s.label}>{a.name}{a.purpose === 'rental' ? ' · Rental' : ''}</div>
              <div style={{ ...s.num, fontSize: 24, fontWeight: 600, color: '#1F4D3D' }}>{fmtCAD(balance)}</div>
              {month !== 'all' && <div style={{ fontSize: 10.5, color: '#6B7268', marginTop: 2 }}>current balance · activity below is {monthLabel(month)} only</div>}
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: '#6B7268' }}>
                <span>In: <span style={{ ...s.num, color: '#1F4D3D' }}>{fmtCAD(inflow)}</span></span>
                <span>Out: <span style={{ ...s.num, color: '#9C4A34' }}>{fmtCAD(outflow)}</span></span>
              </div>
              <div style={{ marginTop: 10 }}>
                {accTxns.slice(0, month === 'all' ? 4 : 12).map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 0', borderTop: '1px solid #E3DECF' }}>
                    <span style={{ color: '#6B7268', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{t.raw_description}</span>
                    <span style={{ ...s.num, fontWeight: 600, color: t.amount < 0 ? '#1B211D' : '#1F4D3D' }}>{t.amount < 0 ? '−' : '+'}{fmtCAD(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {tfsa && (
          <div style={s.card}>
            <div style={s.label}>{tfsa.name}</div>
            <div style={{ ...s.num, fontSize: 24, fontWeight: 600, color: '#1F4D3D' }}>{fmtCAD(tfsa.current_balance)}</div>
            <div style={{ fontSize: 11.5, color: '#6B7268', marginTop: 8, lineHeight: 1.5 }}>Holdings snapshot only.</div>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={s.label}>Other assets & liabilities</div>
        {netWorthItems.length === 0 && <div style={{ fontSize: 13, color: '#6B7268', marginBottom: 12 }}>Nothing added yet.</div>}
        {netWorthItems.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #E3DECF' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: '#6B7268' }}>{item.category}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...s.num, fontWeight: 600, color: item.type === 'liability' ? '#9C4A34' : '#1F4D3D' }}>{item.type === 'liability' ? '−' : ''}{fmtCAD(item.value)}</span>
              <button onClick={() => handleRemove(item.id)} style={{ background: 'none', border: 'none', color: '#6B7268', cursor: 'pointer', fontSize: 12 }}>Remove</button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
          <div><div style={{ fontSize: 11, color: '#6B7268', marginBottom: 3 }}>Name</div><input style={s.field} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Honda Civic" /></div>
          <div><div style={{ fontSize: 11, color: '#6B7268', marginBottom: 3 }}>Type</div>
            <select style={s.field} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, category: NET_WORTH_CATEGORIES[e.target.value][0] }))}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
          </div>
          <div><div style={{ fontSize: 11, color: '#6B7268', marginBottom: 3 }}>Category</div>
            <select style={s.field} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {NET_WORTH_CATEGORIES[form.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><div style={{ fontSize: 11, color: '#6B7268', marginBottom: 3 }}>Value</div><input style={{ ...s.field, width: 100 }} type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="$" /></div>
          <button style={s.btn} disabled={saving} onClick={handleAdd}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}
