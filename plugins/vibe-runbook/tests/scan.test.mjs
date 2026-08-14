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

// The fixture has a known answer: star-00049-j5r is a genuinely stale pin a
// real walk caught. If the pipeline can't see it as a pin end-to-end, the
// plugin fails at its central job — extraction and classification each pass
// in isolation and the composition is what this test is actually checking.
test('the pipeline recognizes the fixture\'s known-stale pin end-to-end', () => {
  const out = scanRunbook(star, 'tests/fixtures/star-smoke.md');
  expect(out.claims.some((c) => c.shape === 'pin')).toBe(true);
  expect(
    out.claims.some((c) => c.text.includes('star-00049-j5r') && c.shape === 'pin')
  ).toBe(true);
});
