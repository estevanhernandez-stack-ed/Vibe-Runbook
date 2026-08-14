const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const COST_RE = /(no spend|spends?\s+[\w\d]+(?:\s+\w+)?|[\w\s]*\bspends?\b[\w\s]*)/i;

export function parseCost(sectionText) {
  const segments = String(sectionText).split('·').map((s) => s.trim());
  const raw = segments.find((s) => /\bspend/i.test(s)) ?? null;
  if (raw === null) return { raw: null, count: null };

  if (/^no spend$/i.test(raw)) return { raw, count: 0 };

  const m = raw.match(/spends?\s+(\d+|one|two|three|four|five)\b/i);
  if (!m) return { raw, count: null };
  const token = m[1].toLowerCase();
  const count = WORD_NUMBERS[token] ?? Number.parseInt(token, 10);
  return { raw, count: Number.isNaN(count) ? null : count };
}
