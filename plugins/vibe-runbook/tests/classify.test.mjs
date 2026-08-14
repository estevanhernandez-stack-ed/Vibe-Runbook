import { classifyShape } from '../engine/classify.mjs';

test('a labelled identifier is a pin', () => {
  expect(classifyShape('Revision `star-00049-j5r`').shape).toBe('pin');
  expect(classifyShape('HEAD `0855bd2`').shape).toBe('pin');
  expect(classifyShape('931 tests green').shape).toBe('pin');
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
  expect(classifyShape('**931 tests green**').shape).toBe('pin');
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
