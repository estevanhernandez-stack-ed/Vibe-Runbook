import { extractClaims } from '../engine/extract.mjs';

// PriceScout/docs/OPERATIONS_RUNBOOK.md writes every checkable expectation as
// ordinary list prose -- "Database: Status should be "ok"", "**Max
// Attempts**: Should be 0" -- never a bold **Right:**/**Wrong:**/**Should:**
// marker. The old extractor found zero claims in a 321-block real runbook
// full of them. These synthetic cases pin the same shape without depending
// on a sibling repo existing on disk.

test('an explicit "should be" inside a list item is a claim, not silence', () => {
  const md = [
    '# Runbook',
    '',
    '## Morning check',
    '',
    '1. Navigate to the health page',
    '2. Check each component:',
    '   - Database: Status should be "ok"',
    '   - Scheduler: Last activity < 30 minutes ago',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  const texts = claims.map((c) => c.text);
  expect(texts.some((t) => t.includes('Database: Status should be "ok"'))).toBe(true);
  // The sibling bullet carries no expectation word and must not be invented.
  expect(texts.some((t) => t.includes('Scheduler'))).toBe(false);
});

test('each of the required prose markers is recognized, case-insensitively', () => {
  const phrases = [
    'Total Queued: Should be < 20',
    'the health check should return 200',
    'the dashboard should show a green banner',
    'you SHOULD SEE the build sha in the response',
    'the changelog should read v2.1.0',
    'the response must be a JSON object',
    'Verify that the migration completed',
    'Expected output: {"status":"ok"}',
  ];
  for (const phrase of phrases) {
    const md = ['# Runbook', '', '## Section', '', `- ${phrase}`].join('\n');
    const { claims } = extractClaims(md, 'test.md');
    const texts = claims.map((c) => c.text);
    expect(texts.some((t) => t.includes(phrase))).toBe(true);
  }
});

// A multi-line list item (the marker on a continuation line, not the item's
// own first line) still gets captured whole -- the same block-joining
// mechanism the bold MARKERS array already relies on for a wrapped
// **Right:** sentence. (Deliberately no `#`-prefixed shell comment inside a
// code fence here: isHeadingLine's line-shape check can't tell a fenced
// shell comment from a markdown heading and splits the unit there --
// a real, pre-existing gap this widening surfaced on Reel-Battles/RUNBOOK.md
// but did not create and does not fix; out of scope for this change.)
test('a prose marker on a wrapped continuation line still reaches the whole list item', () => {
  const md = [
    '# Runbook',
    '',
    '## Startup',
    '',
    '1. Verify achievement definitions are loaded:',
    '   Run `curl http://localhost:5000/api/achievements` -- the response',
    '   should return 11 achievements.',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  const claim = claims.find((c) => c.text.includes('should return 11 achievements'));
  expect(claim).toBeDefined();
  expect(claim.text).toContain('Verify achievement definitions are loaded');
  expect(claim.marker).toBe('prose');
});

// The line-must-not-cross-into-inference case, taken directly from a real
// fixture already in this suite: unmarked.md's own prose reads "You should
// see a 200 come back" and "The error rate panel should be flat" -- both
// contain a required trigger phrase, in an ordinary flowing paragraph, not
// an enumerated line. Extending recognition to any flowing sentence would
// flip that fixture's very premise (zero claims) and start treating a
// person's plain narration of what they expect to see as a checkable claim
// the same way a runbook's enumerated checklist item is. Scoping the
// mechanism to list items is what keeps that fixture's zero-claims
// invariant true without a synthetic carve-out.
test('a prose marker inside ordinary flowing paragraph text is not a claim', () => {
  const md = [
    '# Deploying the widget service',
    '',
    'Once it finishes, hit the health endpoint. You should see a 200 come back',
    'with a JSON body naming the build sha.',
    '',
    'Check the dashboard afterwards. The error rate panel should be flat.',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  expect(claims.length).toBe(0);
});

test('claims found via a prose marker count toward coverage.extracted like any other claim', () => {
  const md = [
    '# Runbook',
    '',
    '## Section',
    '',
    '- Fandango Circuit: Should be "closed"',
  ].join('\n');
  const { claims, coverage } = extractClaims(md, 'test.md');
  expect(claims.length).toBe(1);
  expect(coverage.extracted).toBe(claims.length);
  expect(coverage.markedBlocks).toBeGreaterThanOrEqual(claims.length);
});
