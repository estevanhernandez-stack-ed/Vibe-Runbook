// What counts as a fenced line, in one place. extract.mjs's three internal
// walks (findUnterminatedFence, countContentLines, groupIntoUnits) and
// stubs.mjs's findStubs each track fence state as they go -- four separate
// loops, deliberately, because each computes something different (an
// unterminated-fence line number, a content-line count, a set of claim
// units, a set of stub matches). What must NOT be four separate things is
// the regex-level question "does this line open or close a fence" -- that
// drifted out of sync once already (findStubs shipped with no fence
// awareness at all while extractClaims had three copies of it), and the fix
// is for every walk to ask the same two functions, not to keep each one
// honest by hand.

// A fence opens with 3+ backticks or 3+ tildes (CommonMark allows either,
// and more than three), optionally followed by an info string ("```bash").
// Indentation is capped at 3 spaces, matching CommonMark's rule for an
// unindented-enough fence -- a 4-space indent belongs to an indented code
// block, not a fence, and left uncapped a stray 4-space-indented ``` (an
// author showing literal backtick syntax in a paragraph, not opening a
// real fence) opened a phantom fence that swallowed every real line
// written after it. Returns the exact marker string matched so a caller
// can require the same character and at least the same length to close it
// -- a `~~~` block doesn't close on an unrelated ``` a shell heredoc
// happens to contain, and vice versa.
export function fenceDelimiter(line) {
  const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return m ? m[1] : null;
}

// A closing fence is stricter than an opener: CommonMark permits *only*
// the fence characters and trailing whitespace on a closing line, never an
// info string. Accepting one (this function's original shape) let an
// illustrated nested-fence example -- a runbook showing what fenced
// markdown looks like, e.g. an outer ```markdown fence whose own body
// shows ```bash -- close the outer fence early on its own inner-example
// opener, expose that illustration to ordinary prose scanning, and then
// re-open a phantom fence on what should have been the outer fence's real
// close: parity flips, and everything written after it is silently
// swallowed through EOF.
export function fenceCloses(line, opener) {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  if (!m) return false;
  const closer = m[1];
  return closer[0] === opener[0] && closer.length >= opener.length;
}
