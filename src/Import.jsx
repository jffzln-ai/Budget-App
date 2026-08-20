import React, { useEffect, useState, useRef } from 'react';
import { getAccounts, getExistingTransactionKeys, insertTransactions } from './lib/queries.js';
import { detectCsvFormat, parseCsvRows } from './lib/csvParser.js';
import { categorizeRaw } from './lib/categorize.js';

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

const s = {
  card: { background: '#F8F6F0', borderRadius: 8, padding: 20, maxWidth: 560 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7268', marginBottom: 8 },
  field: { padding: '7px 10px', border: '1px solid #E3DECF', borderRadius: 4, fontSize: 13, background: '#fff' },
  btn: { background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 4, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  ghostBtn: { background: 'none', border: '1px solid #E3DECF', borderRadius: 4, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1B211D' },
};

export default function Import({ householdId }) {
  const [accounts, setAccounts] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [pending, setPending] = useState(null); // { rows, skipped, formatMismatch, detected }
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accs = await getAccounts(householdId);
        const importable = accs.filter(a => a.csv_format);
        if (cancelled) return;
        setAccounts(importable);
        if (importable.length) setAccountId(importable[0].id);
      } catch (err) {
        setMsg({ tone: '#9C4A34', text: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, [householdId]);

  function handleFile(file) {
    setMsg(null);
    setPending(null);
    const account = accounts.find(a => a.id === accountId);
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result);
      const detected = detectCsvFormat(text);
      if (!detected) {
        setMsg({ tone: '#9C4A34', text: "Couldn't recognize this as a TD export." });
        return;
      }
      const formatMismatch = detected !== account.csv_format;
      const rows = parseCsvRows(text, account.csv_format);
      if (!rows.length) {
        setMsg({ tone: '#9C4A34', text: 'No valid rows found in that file.' });
        return;
      }
      try {
        const existingKeys = await getExistingTransactionKeys(householdId, accountId);
        const toInsert = [];
        let skipped = 0;
        rows.forEach(r => {
          const amount = round2((r.credit || 0) - (r.debit || 0));
          const key = `${r.date}|${r.raw_description}|${amount}`;
          if (existingKeys.has(key)) { skipped += 1; return; }
          const cat = categorizeRaw(r.raw_description, amount, { type: account.type, name: account.name });
          toInsert.push({
            date: r.date, raw_description: r.raw_description, amount, running_balance: r.balance,
            category: cat.category, is_transfer: cat.is_transfer, needs_review: cat.needs_review,
            _tags: cat.tags,
          });
        });
        setPending({ rows: toInsert, skipped, formatMismatch, detected });
      } catch (err) {
        setMsg({ tone: '#9C4A34', text: err.message });
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await insertTransactions(householdId, accountId, pending.rows.map(({ _tags, ...r }) => r));
      // Tags need transaction ids we don't have back from a bulk insert without
      // .select() - deferred to the recategorize/tagging feature rather than
      // adding that complexity to the first working version of import.
      setMsg({ tone: '#1F4D3D', text: `Added ${pending.rows.length} new transaction${pending.rows.length === 1 ? '' : 's'}${pending.skipped ? ` (${pending.skipped} already existed, skipped)` : ''}.` });
      setPending(null);
    } catch (err) {
      setMsg({ tone: '#9C4A34', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!accounts) return <div style={{ color: '#6B7268' }}>Loading…</div>;

  return (
    <div style={s.card}>
      <div style={s.label}>Import a statement</div>
      <div style={{ fontSize: 12.5, color: '#6B7268', marginBottom: 14, lineHeight: 1.5 }}>
        Pick which account this CSV is from, then upload the TD export. New transactions get categorized and checked against what's already in the database automatically.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select style={s.field} value={accountId} onChange={e => { setAccountId(e.target.value); setPending(null); setMsg(null); }}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button style={s.btn} onClick={() => fileInputRef.current.click()}>Choose CSV</button>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      {msg && <div style={{ color: msg.tone, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{msg.text}</div>}

      {pending && (
        <div style={{ border: '1px solid #E3DECF', borderRadius: 6, padding: 16, background: '#FCFBF8' }}>
          {pending.formatMismatch && (
            <div style={{ color: '#9C4A34', fontSize: 12.5, marginBottom: 10 }}>
              This file looks like a {pending.detected === 'A' ? 'bank account' : 'credit card'} export, but you picked an account expecting the other format. Double check you picked the right account before confirming.
            </div>
          )}
          <div style={{ fontSize: 13.5, marginBottom: 12 }}>
            <strong>{pending.rows.length}</strong> new transaction{pending.rows.length === 1 ? '' : 's'} ready to add
            {pending.skipped > 0 && <span style={{ color: '#6B7268' }}> ({pending.skipped} already in the system, skipped)</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btn} disabled={busy || pending.rows.length === 0} onClick={handleConfirm}>{busy ? 'Adding…' : 'Confirm import'}</button>
            <button style={s.ghostBtn} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
