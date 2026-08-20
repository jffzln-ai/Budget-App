export const CADENCE_STEP_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, annual: 365 };

export function isIncome(category) {
  return category === 'Payroll';
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Projects every active/needs_confirmation/pending_info rule forward into
// dated occurrences over roughly the next 7 months. Includes occurrences
// that have already passed (next_expected_date can be stale if nobody's
// looked at the app in a while) - callers that need "only future" should
// filter on date > todayIso() themselves, since some callers (the Upcoming
// list) intentionally want to show recently-passed ones too.
export function projectOccurrences(rules) {
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
