import { readFileSync } from 'node:fs';
import { extractClaims } from '../engine/extract.mjs';

const star = readFileSync(new URL('./fixtures/star-smoke.md', import.meta.url), 'utf8');

test('extracts the Right: and Wrong: marked claims from STAR', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const texts = claims.map((c) => c.text);
  expect(texts.some((t) => t.includes('Draft sweeps filed on this room'))).toBe(true);
  expect(texts.some((t) => t.includes('the source’s title, its address'))
    || texts.some((t) => t.includes("the source's title, its address"))).toBe(true);
  expect(claims.length).toBeGreaterThanOrEqual(8);
});

test('every claim carries a file and a 1-indexed line', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  for (const c of claims) {
    expect(c.source.file).toBe('tests/fixtures/star-smoke.md');
    expect(c.source.line).toBeGreaterThan(0);
  }
});

test('claim ids are unique and stable', () => {
  const a = extractClaims(star, 'f.md').claims.map((c) => c.id);
  const b = extractClaims(star, 'f.md').claims.map((c) => c.id);
  expect(a).toEqual(b);
  expect(new Set(a).size).toBe(a.length);
});

test('finds preamble claims from the leading blockquote, not just marker-tagged lines', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const preambleClaims = claims.filter((c) => c.marker === 'preamble');
  expect(preambleClaims.length).toBeGreaterThan(0);
  const texts = preambleClaims.map((c) => c.text);
  expect(texts.some((t) => t.includes('star-00049-j5r'))).toBe(true);
  expect(texts.some((t) => t.includes('0855bd2'))).toBe(true);
});

test('preamble claims carry the same id/source/text shape as marker claims, and count toward coverage.extracted', () => {
  const { claims, coverage } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const preambleClaims = claims.filter((c) => c.marker === 'preamble');
  for (const c of preambleClaims) {
    expect(typeof c.id).toBe('string');
    expect(c.source.file).toBe('tests/fixtures/star-smoke.md');
    expect(c.source.line).toBeGreaterThan(0);
    expect(typeof c.text).toBe('string');
    expect(c.text.length).toBeGreaterThan(0);
  }
  expect(coverage.extracted).toBe(claims.length);
});

test('drops vacuous label-only preamble candidates, keeps the pin claims that motivate the recognizer', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const texts = claims.map((c) => c.text);
  // star-smoke.md:7 and :12 — plain section-intro labels with nothing
  // checkable inside them. A marker-only reader would never see these as
  // claims at all; the preamble recognizer must not invent them either.
  expect(texts).not.toContain('**Where you are:**');
  expect(texts).not.toContain('**Why this list exists.**');
  // The pins are the reason the recognizer exists — must still survive.
  expect(texts.some((t) => t.includes('star-00049-j5r'))).toBe(true);
  expect(texts.some((t) => t.includes('0855bd2'))).toBe(true);
});
