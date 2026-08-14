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
