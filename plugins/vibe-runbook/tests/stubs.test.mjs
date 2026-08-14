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
