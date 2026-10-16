// Interac e-transfers arrive as "SEND E-TFR ***3sd" / "E-TRANSFER ***kCJ": the
// three characters change every time and the bank never says who it was to, so a
// rule on the exact description can never fire twice. For these, a rule is keyed
// on direction + amount instead ("E-TRANSFER OUT 123.32"), which is what actually
// repeats (rent, a regular payment). Everything else keeps its exact description.
// Shared by the browser and api/plaid/sync.js, so no imports.
const ETRANSFER_RE = /^(SEND\s+)?E-?TFR\b|^E-?TRANSFER\b|^INTERAC\s+E-?TRANSFER/i;

export function isETransfer(description) {
  return ETRANSFER_RE.test(String(description || '').trim());
}

export function ruleKey(description, amount) {
  if (!isETransfer(description)) return description;
  const n = Math.abs(Number(amount));
  if (!Number.isFinite(n)) return description;
  return `E-TRANSFER ${Number(amount) < 0 ? 'OUT' : 'IN'} ${n.toFixed(2)}`;
}
