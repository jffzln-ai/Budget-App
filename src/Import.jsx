import React, { useEffect, useState, useRef } from 'react';
import {
  getAccounts, getExistingTransactionKeys, insertTransactions,
  getUnmatchedTransferCandidates, applyTransferMatches,
  getAllTransactions, getTransactionTags, getRecurringRules, insertRecurringRuleCandidates,
  getCategoryRules,
} from './lib/queries.js';
import { detectCsvFormat, parseCsvRows } from './lib/csvParser.js';
import { categorizeRaw } from './lib/categorize.js';
import { matchTransfers, detectNewRecurring } from './lib/reconcile.js';
import PlaidConnect from './PlaidConnect.jsx';

function normalizeKey(desc) { return desc.trim().toUpperCase().replace(/\s+/g, ' '); }

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
  const [dragOver, setDragOver] = useState(false);
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
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result);
      const detected = detectCsvFormat(text);
      if (!detected) {
        setMsg({ tone: '#9C4A34', text: "Couldn't recognize this as a TD export." });
        return;
      }
      const rows = parseCsvRows(text, detected);
      if (!rows.length) {
        setMsg({ tone: '#9C4A34', text: 'No valid rows found in that file.' });
        return;
      }
      try {
        // Guess which account this belongs to: among accounts whose CSV format
        // matches what we detected, score each by how many rows overlap with
        // transactions already on file for it - a genuine statement (even a
        // fresh download covering some already-imported dates) will overlap
        // heavily with its own account and not at all with others.
        const candidateAccounts = accounts.filter(a => a.csv_format === detected);
        const allTxns = await getAllTransactions(householdId);
        const rowKeySet = new Set(rows.map(r => {
          const amount = round2((r.credit || 0) - (r.debit || 0));
          return `${r.date}|${r.raw_description}|${amount}`;
        }));
        const scores = {};
        candidateAccounts.forEach(a => { scores[a.id] = 0; });
        allTxns.forEach(t => {
          if (scores[t.account_id] === undefined) return;
          if (rowKeySet.has(`${t.date}|${t.raw_description}|${t.amount}`)) scores[t.account_id] += 1;
        });
        let guessedId = null, guessedScore = 0;
        Object.entries(scores).forEach(([id, score]) => { if (score > guessedScore) { guessedId = id; guessedScore = score; } });

        let targetAccountId = accountId;
        let guessNote = null;
        if (guessedId && guessedScore >= 2) {
          targetAccountId = guessedId;
          setAccountId(guessedId);
          const guessedName = accounts.find(a => a.id === guessedId).name;
          guessNote = `Matched ${guessedScore} transactions already on file - guessed ${guessedName}. Change the dropdown if that's wrong.`;
        }
        const targetAccount = accounts.find(a => a.id === targetAccountId);
        const formatMismatch = detected !== targetAccount.csv_format;

        const [existingKeys, categoryRules] = await Promise.all([
          getExistingTransactionKeys(householdId, targetAccountId),
          getCategoryRules(householdId),
        ]);
        const ruleByPattern = {};
        categoryRules.forEach(r => { ruleByPattern[r.pattern] = r.category; });

        const toInsert = [];
        let skipped = 0;
        rows.forEach(r => {
          const amount = round2((r.credit || 0) - (r.debit || 0));
          const key = `${r.date}|${r.raw_description}|${amount}`;
          if (existingKeys.has(key)) { skipped += 1; return; }
          const cat = categorizeRaw(r.raw_description, amount, { type: targetAccount.type, name: targetAccount.name });
          const category = !cat.is_transfer && ruleByPattern[r.raw_description] ? ruleByPattern[r.raw_description] : cat.category;
          toInsert.push({
            date: r.date, raw_description: r.raw_description, amount, running_balance: r.balance,
            category, is_transfer: cat.is_transfer, needs_review: cat.needs_review,
            _tags: cat.tags,
          });
        });
        setPending({ rows: toInsert, skipped, formatMismatch, detected, guessNote });
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

      // Reconcile transfers: re-check everything still unmatched (not just
      // what was just imported), since a new import can supply the missing
      // half of a transfer that's been sitting unmatched for a while.
      const unmatchedCandidates = await getUnmatchedTransferCandidates(householdId);
      const transferMatches = matchTransfers(unmatchedCandidates);
      if (transferMatches.length) await applyTransferMatches(transferMatches);

      // Detect new recurring patterns: anything not already covered by an
      // existing rule's match_keys, appearing 2+ times at a roughly fixed
      // interval and amount.
      const [allTxns, tagsById, existingRules] = await Promise.all([
        getAllTransactions(householdId), getTransactionTags(householdId), getRecurringRules(householdId),
      ]);
      const existingKeys = new Set();
      existingRules.forEach(r => (r.match_keys || []).forEach(mk => existingKeys.add(r.account_id + '::' + normalizeKey(mk))));
      const newRuleCandidates = detectNewRecurring(allTxns, tagsById, existingKeys);
      if (newRuleCandidates.length) await insertRecurringRuleCandidates(householdId, newRuleCandidates);

      const parts = [`Added ${pending.rows.length} new transaction${pending.rows.length === 1 ? '' : 's'}`];
      if (pending.skipped) parts.push(`${pending.skipped} already existed and were skipped`);
      if (transferMatches.length) parts.push(`matched ${transferMatches.length / 2} transfer pair${transferMatches.length / 2 === 1 ? '' : 's'}`);
      if (newRuleCandidates.length) parts.push(`found ${newRuleCandidates.length} new recurring pattern${newRuleCandidates.length === 1 ? '' : 's'} to review in Upcoming`);
      setMsg({ tone: '#1F4D3D', text: parts.join(', ') + '.' });
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
      <div style={{ marginBottom: 14 }}>
        <select style={{ ...s.field, marginBottom: 10 }} value={accountId} onChange={e => { setAccountId(e.target.value); setPending(null); setMsg(null); }}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div
          onClick={() => fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          style={{
            border: `2px dashed ${dragOver ? '#1F4D3D' : '#E3DECF'}`, borderRadius: 6, padding: '24px 16px',
            textAlign: 'center', cursor: 'pointer', background: dragOver ? '#EEF3EF' : '#fff', transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1B211D' }}>Drop a CSV here, or click to browse</div>
          <div style={{ fontSize: 11.5, color: '#6B7268', marginTop: 4 }}>TD export for the account selected above</div>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      {msg && <div style={{ color: msg.tone, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{msg.text}</div>}

      {pending && (
        <div style={{ border: '1px solid #E3DECF', borderRadius: 6, padding: 16, background: '#FCFBF8' }}>
          {pending.guessNote && (
            <div style={{ color: '#1F4D3D', fontSize: 12.5, marginBottom: 10 }}>{pending.guessNote}</div>
          )}
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
      <PlaidConnect householdId={householdId} />
    </div>
  );
}
