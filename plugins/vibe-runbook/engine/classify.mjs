// Ordered. First match wins. Every rule is named so a misfire is a rule to
// fix rather than a black box to distrust.
export const RULES = [
  {
    name: 'human:sensory',
    shape: 'human',
    confidence: 0.95,
    test: (t) =>
      /\bCtrl\+P\b|\bprint(?:ed|able)?\b|\bopen (?:it )?in (?:Excel|Sheets)\b|\bon screen\b/i.test(t),
  },
  {
    // A count preceded by a totality quantifier is a coverage record: it says
    // what was tested, not what must be true. Never failed.
    name: 'receipt:totality-count',
    shape: 'receipt',
    confidence: 0.9,
    test: (t) => /\b(?:over all|all|every)\s+\d+\b/i.test(t),
  },
  {
    name: 'pin:labelled-identifier',
    shape: 'pin',
    confidence: 0.9,
    test: (t) =>
      /^\s*(?:revision|head|commit|version|tag)\b\s*[:`]?/i.test(t) ||
      /\b\d+\s+tests?\s+(?:green|passing)\b/i.test(t),
  },
  {
    name: 'status:response-code',
    shape: 'status-assertion',
    confidence: 0.85,
    test: (t) =>
      /\b(?:answers?|returns?|responds? with|comes? back)\b/i.test(t) && /\b[1-5]\d{2}\b/.test(t),
  },
];

// Matching only, never storage: a claim extracted from a preamble carries its
// markdown wrapping in `text` on purpose (extract.mjs keeps it verbatim, both
// for faithful display and because remediation later matches `text` back
// against the file byte-for-byte). "**Revision `star-00049-j5r`**" has to
// reach the pin rule as `Revision \`star-00049-j5r\``, so the rules see a
// stripped copy and the caller's string is never touched.
//
// Only delimiters that wrap the *entire* string come off, one layer at a
// time — a backtick or asterisk sitting in the middle of a claim is content,
// not decoration, and is left alone. "**Revision `star-00049-j5r`**" loses
// its outer `**` and stops there, because the remaining string starts with
// "R" — the inner backticks around the id are never touched.
const WRAPS = [/^\*\*(.+)\*\*$/s, /^__(.+)__$/s, /^\*(.+)\*$/s, /^_(.+)_$/s, /^`(.+)`$/s];

function stripOuterMarkup(text) {
  let s = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of WRAPS) {
      const m = s.match(re);
      if (m) {
        s = m[1].trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

export function classifyShape(text) {
  const normalized = stripOuterMarkup(text);
  for (const rule of RULES) {
    if (rule.test(normalized)) {
      return { shape: rule.shape, confidence: rule.confidence, rule: rule.name };
    }
  }
  return { shape: 'unknown', confidence: 0, rule: 'none' };
}
