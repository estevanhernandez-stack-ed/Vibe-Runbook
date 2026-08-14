import { readFileSync } from 'node:fs';
import { scanRunbook } from '../engine/scan.mjs';

const star = readFileSync(new URL('./fixtures/star-smoke.md', import.meta.url), 'utf8');

test('every claim carries all required fields', () => {
  const out = scanRunbook(star, 'tests/fixtures/star-smoke.md');
  for (const c of out.claims) {
    expect(typeof c.id).toBe('string');
    expect(typeof c.text).toBe('string');
    expect(['pin', 'status-assertion', 'receipt', 'human', 'unknown']).toContain(c.shape);
    expect(['executable', 'static']).toContain(c.venue);
    expect(c.cost).toHaveProperty('raw');
    expect(c.cost).toHaveProperty('count');
    expect(c.verdict).toBeNull();
  }
});

test('scan is read-only and deterministic', () => {
  const a = scanRunbook(star, 'f.md');
  const b = scanRunbook(star, 'f.md');
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('carries the extraction coverage through', () => {
  const out = scanRunbook(star, 'f.md');
  expect(out.coverage.confidence).toBe('high');
  expect(out.coverage.totalBlocks).toBeGreaterThan(out.coverage.markedBlocks);
});

// The fixture has a known answer: two genuinely stale pins a real walk
// caught (star-00049-j5r, 0855bd2), sitting in one comma-separated
// sentence in the preamble, one of them split across a line-wrap (HEAD /
// `0855bd2`). If the pipeline can't see both as pins end-to-end, the
// plugin fails at its central job — extraction and classification each
// pass in isolation and the composition is what this test is actually
// checking. Assert each by name, not just "some claim".
test('the pipeline recognizes both of the fixture\'s known-stale pins end-to-end', () => {
  const out = scanRunbook(star, 'tests/fixtures/star-smoke.md');
  const pinTexts = out.claims.filter((c) => c.shape === 'pin').map((c) => c.text);

  expect(pinTexts.some((t) => t.includes('star-00049-j5r'))).toBe(true);
  expect(pinTexts.some((t) => t.includes('0855bd2'))).toBe(true);
});

// The third number in that same sentence is NOT a pin (controller ruling,
// 2026-08-14). It is still extracted — the reader should see it — and it
// reports as a QUESTION rather than a FAIL that would fire again on every
// green suite that grew by one test.
test('the fixture\'s test count is extracted but escalates to unknown, never a pin', () => {
  const out = scanRunbook(star, 'tests/fixtures/star-smoke.md');
  const testCount = out.claims.find((c) => c.text.includes('931 tests green'));

  expect(testCount).toBeDefined();
  expect(testCount.shape).toBe('unknown');
  expect(testCount.classifierRule).toBe('none');
});
