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

// star-smoke.md:3-5 (source) reads as one wrapped sentence: "**Revision
// `star-00049-j5r`**, HEAD `0855bd2`, 931 tests green, working tree in
// sync with origin/main." HEAD's sha sits on the next physical line from
// its own label, and "931 tests green" carries no bold or backtick at
// all. Both only become findable once physical lines join into one
// logical sentence and that sentence's comma list is split into claims.
test('a preamble pin split across a line-wrap arrives with its label attached', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const preambleTexts = claims.filter((c) => c.marker === 'preamble').map((c) => c.text);
  expect(preambleTexts).toContain('HEAD `0855bd2`');
});

test('a preamble pin with no bold or backtick delimiter is still its own claim', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const preambleTexts = claims.filter((c) => c.marker === 'preamble').map((c) => c.text);
  expect(preambleTexts).toContain('931 tests green');
});

// star-smoke.md:163 is a bare "**Right:**" with nothing after it on the
// same line — its content is a bulleted list two lines down. This was the
// Task 1 minor limitation (a bare marker whose content lives in a list
// below it goes unmatched); it shares a root cause with the line-wrap
// gaps above and closes the same way, by joining into a logical block
// instead of reading one physical line at a time.
test('a bare marker reaches into the bulleted list under it, one claim per item', () => {
  const { claims } = extractClaims(star, 'tests/fixtures/star-smoke.md');
  const rightClaims = claims.filter((c) => c.marker === 'right');
  const fromTheList = rightClaims.find((c) => c.text === 'The button is dead until a file is chosen.');
  expect(fromTheList).toBeDefined();
  expect(fromTheList.source.line).toBe(165);
});
