import { classifyShape } from '../engine/classify.mjs';

test('a labelled identifier is a pin', () => {
  expect(classifyShape('Revision `star-00049-j5r`').shape).toBe('pin');
  expect(classifyShape('HEAD `0855bd2`').shape).toBe('pin');
});

// Controller ruling, 2026-08-14: the spec lists "931 tests green" as a pin
// example in one section and among the innocently-drifted numbers in
// another. Resolved against the pin rule. A pin is FAIL-eligible, and a
// growing suite would then report FAIL forever -- exactly the noise the
// receipt rule exists to suppress. It falls through to `unknown` ->
// QUESTION, the designed escalation for genuine ambiguity, and lands
// beside 'Your Liverpool export says 58' below: present tense, but about
// a number that moves on its own.
test('a test count is not a pin; it escalates rather than failing forever', () => {
  const r = classifyShape('931 tests green');
  expect(r.shape).toBe('unknown');
  expect(r.confidence).toBe(0);
  expect(classifyShape('412 tests passing').shape).toBe('unknown');
});

test('a totality quantifier over a count is a receipt', () => {
  expect(classifyShape('The chain walk over all 17 stored rooms').shape).toBe('receipt');
  expect(classifyShape('re-read as CSV with all 45 rows and 10 columns intact').shape).toBe('receipt');
});

test('a present-tense claim about a response code is a status assertion', () => {
  expect(classifyShape('Every new route answers 401 unauthenticated').shape).toBe('status-assertion');
});

test('a sensory instruction is human', () => {
  expect(classifyShape('Read it on screen, then Ctrl+P and read the PDF').shape).toBe('human');
  expect(classifyShape('open in Excel and Sheets').shape).toBe('human');
});

// The hard case, and the one that matters most. Present tense, but it refers
// to a past artifact. Both "pin" and "receipt" are wrong answers. Escalating
// is the right answer.
test('an ambiguous claim escalates to unknown rather than guessing', () => {
  const r = classifyShape('Your Liverpool export says 58');
  expect(r.shape).toBe('unknown');
  expect(r.confidence).toBe(0);
});

test('every classification names the rule that fired', () => {
  expect(classifyShape('Revision `star-00049-j5r`').rule).toBe('pin:labelled-identifier');
  expect(classifyShape('Your Liverpool export says 58').rule).toBe('none');
});

// A preamble claim keeps its markdown wrapping verbatim in `text` (that's
// extract.mjs's job, not this file's) — classify has to see through it to
// reach the same verdict it already gives the unwrapped form above.
test('surrounding markdown emphasis and code delimiters do not block classification', () => {
  expect(classifyShape('**Revision `star-00049-j5r`**').shape).toBe('pin');
  expect(classifyShape('`HEAD 0855bd2`').shape).toBe('pin');
});

// Regression for a real bug: the old check was "starts with X and ends with
// X", which is fooled by two unrelated spans sitting at a string's two
// edges. Neither of these is a single wrapped span — each is two spans
// around ordinary joined prose (exactly the shape a joined **Right:**/
// **Wrong:** sentence can produce, e.g. "**Right:** `GET /health` returns
// `200`" — a completely ordinary runbook line) — and stripping the outer
// pair would glue unrelated content together and misfire the pin rule.
test('two unrelated delimited spans at a string\'s edges do not get treated as one wrap', () => {
  const backtickCase = classifyShape('`revision` is old, see `abc`');
  expect(backtickCase.shape).toBe('unknown');

  const boldCase = classifyShape('**Revision** is stale, see **HEAD**');
  expect(boldCase.shape).toBe('unknown');
});

// A real pin rarely sits at the start of a bare line -- it is almost always
// an enumerated item ("- revision: ...") or a line inside a blockquote
// ("> - HEAD: ..."), and the old anchor only recognized the label at column
// zero. STAR/docs/smoke-2026-08-12.md's own header pins are exactly this
// shape: a leading "- " bullet inside the preamble blockquote defeated the
// anchor and every one of them fell through to unknown.
test('the pin rule tolerates a leading list or quote marker before the label', () => {
  expect(classifyShape('- revision: `star-00049-j5r`').shape).toBe('pin');
  expect(classifyShape('* head: `0855bd2`').shape).toBe('pin');
  expect(classifyShape('+ commit: `abc1234`').shape).toBe('pin');
  expect(classifyShape('1. version: `2.1.0`').shape).toBe('pin');
  expect(classifyShape('> - HEAD: `0855bd2`').shape).toBe('pin');
});

// The label vocabulary itself must not widen -- only the punctuation in
// front of it. A leading marker on a claim that isn't one of the five known
// labels is still not a pin.
test('leading list punctuation does not widen the label vocabulary itself', () => {
  expect(classifyShape('- Your Liverpool export says 58').shape).toBe('unknown');
});

// Markdown bold has no space between its delimiter and the word it wraps;
// a list marker always does. The punctuation tolerance above must require
// real whitespace after the marker, or "**Revision**" -- two asterisks with
// no space, from the same family as the two-unrelated-spans regression
// above -- would misparse as a "*"-bulleted "* Revision" and start
// matching the pin rule it was never meant to reach.
test('bold-emphasis asterisks are never mistaken for a list-marker prefix', () => {
  const boldCase = classifyShape('**Revision** is stale, see **HEAD**');
  expect(boldCase.shape).toBe('unknown');
});

// Change 3: a labelled backtick span classifies as a pin so it is visible
// in the report and available to remediation -- but classification is not
// execution. Recognizing "label: `x`" as something to run (rather than just
// something to classify) would mean this exact string, `Version: `2.1.0``,
// gets run as a shell command the moment a real shell is wired in. Paired
// with the resolveCommand assertion in verify.test.mjs.
test('a labelled backtick span classifies as a pin, not unknown', () => {
  const r = classifyShape('Version: `2.1.0`');
  expect(r.shape).toBe('pin');
  expect(r.rule).toBe('pin:labelled-identifier');
});
