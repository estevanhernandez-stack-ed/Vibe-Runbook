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
    // Deliberately narrower than "any present-tense number": a labelled
    // identifier names a thing you can look at right now and get the same
    // answer back. A test count does not, and used to match here (Fix 11,
    // controller ruling 2026-08-14, resolving a contradiction in the spec
    // itself — `931 tests green` appears as a pin example in one section
    // and among the innocently-drifted numbers in another). A pin is
    // FAIL-eligible; a suite that grows by one test would then report FAIL
    // forever, which is precisely the noise the receipt rule exists to
    // suppress. With the clause gone it falls through to `unknown` ->
    // QUESTION, the designed escalation for genuine ambiguity, beside
    // 'Your Liverpool export says 58'.
    //
    // The label can sit behind a leading list/quote marker -- "- revision:
    // ...", "1. version: ...", "> - HEAD: ..." -- because a real pin is
    // almost always an enumerated line, not bare column-zero prose (marker
    // widening, 2026-08-14: STAR/docs/smoke-2026-08-12.md's own header pins
    // are a "- " bulleted list inside a blockquote, and the old anchor
    // missed all three). Each marker token requires trailing whitespace
    // (`\s+`, not `\s*`) so this never swallows markdown bold: "**Revision**"
    // has no space between its two asterisks and the word they wrap, so the
    // "*"-as-list-marker branch cannot consume it -- see the sibling
    // two-unrelated-spans regression this shares a root cause with. The
    // label vocabulary itself is untouched; only what is tolerated in front
    // of it widened.
    name: 'pin:labelled-identifier',
    shape: 'pin',
    confidence: 0.9,
    test: (t) => /^\s*(?:(?:[-*+>]|\d+[.)])\s+)*(?:revision|head|commit|version|tag)\b\s*[:`]?/i.test(t),
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
//
// "Wraps the entire string" is enforced, not assumed: a delimiter counts as
// a wrap only if it occurs *exactly* at the two ends and nowhere else. A
// naive "starts with X and ends with X" check (what this used to be) is
// fooled by two unrelated spans sitting at a string's edges —
// "`revision` is old, see `abc`" starts and ends with a backtick, but it is
// two spans, not one, and stripping the outer pair would glue unrelated
// prose into the match. unwrapOnce rejects that case by checking the
// delimiter doesn't reappear anywhere inside.
const WRAP_DELIMS = ['**', '__', '*', '_', '`'];

function unwrapOnce(s, delim) {
  if (s.length < delim.length * 2 + 1) return null;
  if (!s.startsWith(delim) || !s.endsWith(delim)) return null;
  const inner = s.slice(delim.length, s.length - delim.length);
  if (inner.includes(delim)) return null;
  return inner;
}

// The same leading list/quote punctuation the pin rule above tolerates in
// front of a label ("- revision: ...", "1. version: ...", "> - HEAD: ...")
// -- factored out so a caller deriving a label the same way the pin rule
// recognizes one (verify.mjs's resolveCommand) strips the same prefix
// rather than keeping a second, silently-drifted copy of the pattern. That
// drift already happened once: STAR's real header pin classified as `pin`
// here while resolveCommand's own label derivation kept the "- " prefix,
// so a `config.pins.revision` entry a user would reasonably guess could
// never resolve.
const LEADING_LIST_PUNCTUATION_RE = /^\s*(?:(?:[-*+>]|\d+[.)])\s+)*/;

export function stripLeadingListPunctuation(text) {
  return text.replace(LEADING_LIST_PUNCTUATION_RE, '');
}

export function stripOuterMarkup(text) {
  let s = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const delim of WRAP_DELIMS) {
      const inner = unwrapOnce(s, delim);
      if (inner !== null) {
        s = inner.trim();
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
