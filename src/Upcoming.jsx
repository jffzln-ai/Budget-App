import React, { useEffect, useState, useMemo } from 'react';
import { getRecurringRules, confirmRule } from './lib/queries.js';

const CADENCE_STEP_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, annual: 365 };
const STATUS_LABEL = { active: 'Confirmed', needs_confirmation: 'Needs confirmation', pending_info: 'Waiting on you', dismissed: 'Dismissed' };
const STATUS_COLOR = { active: '#1F4D3D', needs_confirmation: '#B8894A', pending_info: '#9C4A34', dismissed: '#6B7268' };

function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
function isIncome(category) {
  return category === 'Payroll';
}

function projectOccurrences(rules) {
  const out = [];
  rules.forEach(rule => {
    if (rule.status === 'dismissed' || !rule.next_expected_date) return;
    const step = CADENCE_STEP_DAYS[rule.cadence] || 30;
    let d = new Date(rule.next_expected_date + 'T00:00:00');
    const horizon = new Date(d.getTime() + 7 * 31 * 86400000);
    let n = 0;
    while (d <= horizon && n < 30) {
      const dateStr = d.toISOString().slice(0, 10);
      out.push({ occId: `${rule.id}_${dateStr}`, rule, date: dateStr });
      d = new Date(d.getTime() + step * 86400000);
      n += 1;
      if (rule.cadence === 'annual') break;
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const s = {
  card: { background: '#F8F6F0', borderRadius: 8 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #E3DECF', gap: 12 },
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' },
  badge: (color) => ({ fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase' }),
  btn: { background: '#1F4D3D', color: '#F8F6F0', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
};

export default function Upcoming({ householdId }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);

  async function load() {
    try {
      const r = await getRecurringRules(householdId);
      setRules(r);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [householdId]);

  const occurrences = useMemo(() => (rules ? projectOccurrences(rules) : []), [rules]);
  const moneyIn = occurrences.filter(o => isIncome(o.rule.category));
  const moneyOut = occurrences.filter(o => !isIncome(o.rule.category));
  const unscheduled = (rules || []).filter(r => r.status !== 'dismissed' && !r.next_expected_date);

  async function handleConfirm(rule) {
    setConfirming(rule.id);
    try {
      await confirmRule(rule.id);
      await load(); // re-fetch so the confirmed status reflects everywhere immediately
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirming(null);
    }
  }

  if (error) return <div style={{ color: '#9C4A34' }}>{error}</div>;
  if (!rules) return <div style={{ color: '#6B7268' }}>Loading upcoming…</div>;

  return (
    <div>
      {unscheduled.length > 0 && (
        <div style={{ ...s.card, padding: 16, marginBottom: 14, border: '1px solid #9C4A34' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7268', marginBottom: 8 }}>Waiting on you</div>
          {unscheduled.map(r => (
            <div key={r.id} style={{ fontSize: 13, padding: '4px 0' }}>{r.label} — <span style={{ color: '#6B7268', fontSize: 11.5 }}>{r.note}</span></div>
          ))}
        </div>
      )}

      {moneyIn.length > 0 && (
        <div style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#1F4D3D' }}>Money in</div>
          {moneyIn.map(o => (
            <div key={o.occId} style={s.row}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{o.rule.label}</div>
                <div style={{ fontSize: 11, color: '#6B7268' }}>{fmtDate(o.date)} · {o.rule.cadence}</div>
              </div>
              <div style={{ ...s.num, fontSize: 14, fontWeight: 600, color: '#1F4D3D' }}>+{fmtCAD(o.rule.expected_amount)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7268' }}>Money out</div>
        {moneyOut.map(o => (
          <div key={o.occId} style={s.row}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{o.rule.label}</div>
              <div style={{ fontSize: 11, color: '#6B7268' }}>{fmtDate(o.date)} · {o.rule.cadence}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...s.num, fontSize: 14, fontWeight: 600 }}>{fmtCAD(o.rule.expected_amount)}</span>
              <span style={s.badge(STATUS_COLOR[o.rule.status])}>{STATUS_LABEL[o.rule.status]}</span>
              {o.rule.status === 'needs_confirmation' && (
                <button style={s.btn} disabled={confirming === o.rule.id} onClick={() => handleConfirm(o.rule)}>
                  {confirming === o.rule.id ? 'Saving…' : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        ))}
        {moneyOut.length === 0 && <div style={{ padding: 24, fontSize: 13, color: '#6B7268' }}>Nothing projected.</div>}
      </div>
    </div>
  );
}
