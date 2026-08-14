import { findStubs } from '../engine/stubs.mjs';
import { extractClaims } from '../engine/extract.mjs';
import { scanRunbook } from '../engine/scan.mjs';

const doc = [
  '# Ops',
  '',
  '- Health: should be "ok"',
  '',
  '**Unwritten:** Who gets paged when the error rate crosses its threshold?',
  '',
  '**Unwritten:** What does degraded-but-acceptable look like here?',
  '',
].join('\n');

test('finds each stub with its question and line', () => {
  const s = findStubs(doc);
  expect(s).toHaveLength(2);
  expect(s[0].question).toMatch(/Who gets paged/);
  expect(s[0].line).toBe(5);
});

test('a stub is NOT extracted as a claim', () => {
  const { claims } = extractClaims(doc, 'ops.md');
  expect(claims.some((c) => /Who gets paged/.test(c.text))).toBe(false);
});

test('scanRunbook reports stubs alongside claims, counted separately', () => {
  const out = scanRunbook(doc, 'ops.md');
  expect(out.stubs).toHaveLength(2);
  expect(out.claims.some((c) => /degraded-but-acceptable/.test(c.text))).toBe(false);
});

test('a document with no stubs reports an empty list, not undefined', () => {
  const out = scanRunbook('# Ops\n\n- Health: should be "ok"\n', 'ops.md');
  expect(out.stubs).toEqual([]);
});

// Round 2, Fix 1: a stub inside a fenced code block is a runbook showing the
// syntax, not a real unwritten question -- the same distinction
// extract-fence-safety.test.mjs already guards three ways for claims. Both
// halves in one test so it proves the discrimination (fenced suppressed,
// real one still found) rather than just the suppression alone.
test('a stub inside a fenced code block is not counted, but a real one outside it still is', () => {
  const md = [
    '# Runbook',
    '',
    '## How to write a stub',
    '',
    'Use this exact syntax when a section is not yet written:',
    '',
    '```markdown',
    '**Unwritten:** who owns this rotation?',
    '```',
    '',
    '**Unwritten:** What does degraded-but-acceptable look like here?',
  ].join('\n');

  const s = findStubs(md);
  expect(s).toHaveLength(1);
  expect(s[0].question).toMatch(/degraded-but-acceptable/);
  expect(s.some((stub) => /who owns this rotation/.test(stub.question))).toBe(false);
});

// Round 2, Fix 2: the generator always emits a stub at line start, but a
// human writing one by hand reaches for a bullet the way every other marker
// in this family already tolerates (see classify.mjs's pin rule). Before
// this fix, a bulleted stub matched neither STUB_RE nor a claim marker and
// silently disappeared from both counts.
test('a bulleted stub is still recognized as a stub, and still excluded from claims', () => {
  const md = [
    '# Ops',
    '',
    '- **Unwritten:** Who gets paged when the error rate crosses its threshold?',
  ].join('\n');

  const s = findStubs(md);
  expect(s).toHaveLength(1);
  expect(s[0].question).toMatch(/Who gets paged/);

  const { claims } = extractClaims(md, 'ops.md');
  expect(claims.some((c) => /Who gets paged/.test(c.text))).toBe(false);
});
