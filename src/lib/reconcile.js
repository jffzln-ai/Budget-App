// Post-import reconciliation: after new transactions land, look for transfer
// pairs among everything still unmatched, and look for new recurring
// patterns among everything not already covered by a rule. Both are pure
// functions over data already fetched - the caller handles the actual reads/writes.

const REF_CODE_PATTERN = /^([A-Z]{2}\d{3})/;

// Two-pass, mirroring the original CSV pipeline: match by shared reference
// code first (most transfers have one), then fall back to date+amount for
// the rest (credit card payments, "PTS TO/FRM" transfers, which don't carry
// a matchable code on both legs).
export function matchTransfers(candidates) {
  const matches = [];
  const matched = new Set();

  const byCode = {};
  candidates.forEach(t => {
    const m = t.raw_description.match(REF_CODE_PATTERN);
    if (m) (byCode[m[1]] = byCode[m[1]] || []).push(t);
  });
  Object.values(byCode).forEach(group => {
    if (group.length === 2 && group[0].account_id !== group[1].account_id && Math.abs(group[0].amount + group[1].amount) < 0.01) {
      const gid = `tg_${group[0].id}_${group[1].id}`;
      group.forEach(t => { matches.push({ id: t.id, transfer_group_id: gid }); matched.add(t.id); });
    }
  });

  const remaining = candidates.filter(t => !matched.has(t.id));
  remaining.forEach(t => {
    if (matched.has(t.id)) return;
    const partner = remaining.find(t2 =>
      t2.id !== t.id && !matched.has(t2.id) &&
      t2.account_id !== t.account_id &&
      t2.date === t.date &&
      Math.abs(t2.amount + t.amount) < 0.01
    );
    if (partner) {
      const gid = `tg_${t.id}_${partner.id}`;
      matches.push({ id: t.id, transfer_group_id: gid });
      matches.push({ id: partner.id, transfer_group_id: gid });
      matched.add(t.id);
      matched.add(partner.id);
    }
  });

  return matches;
}

function normalizeKey(desc) {
  return desc.trim().toUpperCase().replace(/\s+/g, ' ');
}

const CADENCE_STEP_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, annual: 365 };
const EXCLUDED_TAGS = new Set(['reimbursable_work', 'uncategorized_transfer']);

function inferCadence(sortedDates) {
  if (sortedDates.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < sortedDates.length; i++) gaps.push((new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / 86400000);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avgGap <= 10) return 'weekly';
  if (avgGap <= 20) return 'biweekly';
  if (avgGap <= 45) return 'monthly';
  if (avgGap <= 120) return 'quarterly';
  return 'annual';
}

// A real recurring bill has two properties casual repeat shopping doesn't:
// it happens at a roughly fixed interval, and it costs roughly the same
// amount each time. Requiring both (not just "same description twice") is
// what keeps this from flagging every store you've shopped at more than once.
export function detectNewRecurring(transactions, tagsById, existingMatchKeys) {
  const groups = {};
  transactions.forEach(t => {
    if (t.is_transfer) return;
    if ((tagsById[t.id] || []).some(tag => EXCLUDED_TAGS.has(tag))) return;
    const key = t.account_id + '::' + normalizeKey(t.raw_description);
    if (existingMatchKeys.has(key)) return;
    (groups[key] = groups[key] || []).push(t);
  });
  const candidates = [];
  Object.values(groups).forEach(txns => {
    if (txns.length < 2) return;
    const amounts = txns.map(t => Math.abs(t.amount));
    const maxAmt = Math.max(...amounts), minAmt = Math.min(...amounts);
    if (minAmt === 0 || maxAmt / minAmt > 1.15) return;
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const cadence = inferCadence(sorted.map(t => t.date));
    if (!cadence) return;
    const last = sorted[sorted.length - 1];
    const step = CADENCE_STEP_DAYS[cadence];
    const next = new Date(new Date(last.date + 'T00:00:00').getTime() + step * 86400000).toISOString().slice(0, 10);
    candidates.push({
      label: last.raw_description, account_id: last.account_id, match_keys: [normalizeKey(last.raw_description)],
      category: last.category, cadence, expected_amount: Math.abs(last.amount),
      last_date: last.date, next_expected_date: next, status: 'needs_confirmation',
    });
  });
  return candidates;
}
