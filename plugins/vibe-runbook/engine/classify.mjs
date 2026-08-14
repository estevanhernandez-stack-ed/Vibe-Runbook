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

export function classifyShape(text) {
  for (const rule of RULES) {
    if (rule.test(text)) {
      return { shape: rule.shape, confidence: rule.confidence, rule: rule.name };
    }
  }
  return { shape: 'unknown', confidence: 0, rule: 'none' };
}
