import Papa from 'papaparse';

function parseAmountStr(s) {
  const v = (s ?? '').toString().trim().replace(/^"|"$/g, '');
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export function detectCsvFormat(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  for (const line of lines.slice(0, 5)) {
    const parsed = Papa.parse(line).data[0];
    if (!parsed || !parsed[0]) continue;
    const field = parsed[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(field)) return 'A';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(field)) return 'B';
  }
  return null;
}

export function parseCsvRows(text, csvFormat) {
  const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = [];
  for (const line of parsed.data) {
    if (!line || line.length < 5) continue;
    const [dateS, desc, debit, credit, bal] = line;
    let iso;
    if (csvFormat === 'B') {
      const parts = (dateS || '').split('/');
      if (parts.length !== 3) continue;
      const [m, d, y] = parts;
      iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    } else {
      iso = (dateS || '').trim();
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    rows.push({
      date: iso,
      raw_description: (desc || '').trim().replace(/\s+/g, ' '),
      debit: parseAmountStr(debit),
      credit: parseAmountStr(credit),
      balance: parseAmountStr(bal),
    });
  }
  return rows;
}
