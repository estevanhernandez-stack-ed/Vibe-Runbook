import { fenceDelimiter, fenceCloses } from './fence.mjs';
import { stripLeadingListPunctuation } from './classify.mjs';

// An unwritten section is not a claim — there is nothing to check — so it gets
// no verdict and no shape. It is a property of the document, counted separately
// and reported on its own line.
export const STUB_RE = /^\s*\*\*Unwritten:\*\*\s*(.+)$/i;

// A bulleted stub ("- **Unwritten:** ...") is not a claim any more than a
// bare one is. This marker family is list-item-heavy everywhere else in this
// plugin — Right/Wrong/Expected/pin all tolerate the same leading list/quote
// punctuation (see classify.mjs's pin rule and stripLeadingListPunctuation).
// The generator always emits a stub at line start, so this never fires on
// generated output, but a human writing one by hand would reach for a bullet
// without thinking about it, and an unrecognized bulleted stub used to
// vanish from both counts: not a claim (list-item prose without a "should"
// phrase misses hasProseExpectation), not a stub either. Reuses
// stripLeadingListPunctuation rather than a second copy of its pattern, so
// "what counts as leading list punctuation" stays one decision.
//
// Exported (not just used internally) so extract.mjs recognizes and excludes
// the exact same lines this recognizes as stubs — one decision about what a
// stub line is, shared by both the claims side and the stubs side, rather
// than two regexes that can drift apart the way findStubs and extractClaims
// already had for fence-awareness before this fix.
export function matchStub(line) {
  return stripLeadingListPunctuation(line).match(STUB_RE);
}

// A stub written inside a fenced code block is an illustration of the
// syntax, not a real unwritten question — the same distinction extract.mjs
// already draws for claims (extract-fence-safety.test.mjs guards it three
// ways there: a runbook showing what fenced markdown looks like must not
// misfire). This walk tracks fence state the same way extract.mjs's own
// passes do, using the fenceDelimiter/fenceCloses this module now shares
// with it via fence.mjs, so "is this line fenced" is answered in one place
// instead of being reimplemented — and silently skipped — a second time.
export function findStubs(markdown) {
  const out = [];
  const lines = String(markdown).split(/\r?\n/);
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence) {
      if (fenceCloses(line, fence)) fence = null;
      continue;
    }
    const opener = fenceDelimiter(line);
    if (opener) {
      fence = opener;
      continue;
    }
    const m = matchStub(line);
    if (m) out.push({ question: m[1].trim(), line: i + 1 });
  }
  return out;
}
