import { readFileSync } from 'node:fs';
import { extractClaims } from '../engine/extract.mjs';

const unmarked = readFileSync(new URL('./fixtures/unmarked.md', import.meta.url), 'utf8');
const star = readFileSync(new URL('./fixtures/star-smoke.md', import.meta.url), 'utf8');

test('an unmarked runbook yields low confidence, not confident silence', () => {
  const { coverage } = extractClaims(unmarked, 'tests/fixtures/unmarked.md');
  expect(coverage.confidence).toBe('low');
});

test('an unmarked runbook never invents claims', () => {
  const { claims } = extractClaims(unmarked, 'tests/fixtures/unmarked.md');
  expect(claims.length).toBe(0);
});

test('low confidence carries actionable markup guidance naming the file', () => {
  const { coverage } = extractClaims(unmarked, 'tests/fixtures/unmarked.md');
  expect(coverage.guidance).toEqual(expect.stringContaining('**Right:**'));
  expect(coverage.guidance).toEqual(expect.stringContaining('tests/fixtures/unmarked.md'));
});

test('a marked runbook yields high confidence', () => {
  const { coverage } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  expect(coverage.confidence).toBe('high');
  expect(coverage.guidance).toBeNull();
});

// Regression for a real bug: markupGuidance() used to say "found no marked
// claims" any time confidence was 'low', even when markedBlocks > 0. A large
// document can carry real markers and still fall below LOW_CONFIDENCE_RATIO
// on ratio alone -- 20 markers in a 1200-line ops doc is exactly that shape
// (20/1200 = 0.0167, under the 0.02 threshold). The guidance sentence has to
// stay true in that band, not just at true-zero.
test('a sparsely-marked runbook (nonzero markers, low ratio) gets honest guidance, not a false zero', () => {
  const markerLines = Array.from({ length: 20 }, (_, i) => `**Right:** step ${i} did the thing`);
  const plainLines = Array.from({ length: 1180 }, (_, i) => `Plain prose line ${i} about the system.`);
  const synthetic = `# Title\n\n${markerLines.concat(plainLines).join('\n\n')}\n`;

  const { coverage } = extractClaims(synthetic, 'tests/synthetic-sparse.md');

  expect(coverage.markedBlocks).toBe(20);
  expect(coverage.totalBlocks).toBe(1200);
  expect(coverage.confidence).toBe('low');
  expect(coverage.guidance).not.toEqual(expect.stringContaining('found no marked claims'));
  expect(coverage.guidance).toEqual(expect.stringContaining('20'));
  expect(coverage.guidance).toEqual(expect.stringContaining('tests/synthetic-sparse.md'));
  expect(coverage.guidance).toEqual(expect.stringContaining('**Right:**'));
});
