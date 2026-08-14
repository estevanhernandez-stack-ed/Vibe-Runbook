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

// Fence awareness, round 2. isHeadingLine's naive line-shape check
// (`/^\s*#{1,6}\s/`) can't tell a fenced shell comment from a markdown
// heading -- "# Should return 11 achievements" inside a ```bash block reads
// as a heading, which flushes the unit it's inside and drops the comment
// from any claim text before this widening's own check ever runs. This is
// not a Reel-Battles quirk: `# something` is the single most common line
// inside a shell block, and ops runbooks lean on shell blocks constantly.
test('a "#" shell comment inside a fenced code block is never mistaken for a heading', () => {
  const md = [
    '# Runbook',
    '',
    '## Startup',
    '',
    '1. Verify achievement definitions are loaded, and should be flat:',
    '   ```bash',
    '   # should be a comment, not a claim',
    '   curl http://localhost:5000/api/achievements',
    '   ```',
    '2. Confirm the response body should be non-empty.',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  // Item 1's own first line carries a real marker outside the fence and
  // must still be found -- the fence must not swallow it via a stray flush.
  expect(claims.some((c) => c.text.includes('should be flat'))).toBe(true);
  // Item 2, entirely outside any fence, is unaffected.
  expect(claims.some((c) => c.text.includes('should be non-empty'))).toBe(true);
  // Total: exactly those two -- the fenced comment must not itself become a
  // third claim.
  expect(claims.length).toBe(2);
});

// The other half of fence awareness: content *inside* a fence is code, not
// prose, and is never scanned for a claim even when it contains a required
// phrase verbatim. `echo "should be ok"` in an example block is not a claim
// about the system -- it's illustrating a command.
test('an expectation phrase inside fenced code is never extracted as a claim', () => {
  const md = [
    '# Runbook',
    '',
    '## Example',
    '',
    '- Sample output:',
    '  ```',
    '  echo "the response should be ok"',
    '  ```',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  expect(claims.length).toBe(0);
});

// Tilde fences are valid CommonMark too, and must be tracked the same way.
test('a ~~~ tilde fence is tracked the same way as a backtick fence', () => {
  const md = [
    '# Runbook',
    '',
    '## Example',
    '',
    '- Sample output:',
    '  ~~~',
    '  echo "the response should be ok"',
    '  ~~~',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  expect(claims.length).toBe(0);
});

// Round 3 correction: round 2 had this backwards. "Prose before and after a
// fence still joins as one unit" was itself the bug -- **Right:** the
// endpoint answers 200 + fence + with the build sha used to glue into "the
// endpoint answers 200 with the build sha", two non-adjacent fragments
// joined into a string that exists nowhere in the file (the fence sits
// physically between them in the real document). Remediation matches
// claim.text back byte-for-byte, so a fabricated join is a permanently
// unmatchable claim. A fence now flushes the unit it interrupts instead of
// staying transparent to it -- text before and after a fence can never
// share one claim's text again, even at the cost of losing this specific
// catch (the post-fence fragment on its own is plain paragraph text, not a
// list item, so it no longer qualifies for prose-marker scanning either;
// accepted, see the marker-widening report).
test('a fence flushes the unit it interrupts -- text before and after never fabricates a joined claim', () => {
  const md = [
    '# Runbook',
    '',
    '## Health check',
    '',
    '**Right:** the endpoint answers 200',
    '```bash',
    'curl -s localhost/health',
    '```',
    'with the build sha in the body.',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  const fabricated = claims.find((c) => c.text.includes('200') && c.text.includes('build sha'));
  expect(fabricated).toBeUndefined();
  // The pre-fence marker is still found, on its own, with its own real text.
  expect(claims.some((c) => c.text === 'the endpoint answers 200')).toBe(true);
});

// Table rows, per the coordinator's fix 2: "| Database | Status should be
// "ok" |" is the same claim shape as a list item's "Database: Status should
// be "ok"" -- same explicit word, same enumerated-line structure, just a
// pipe cell instead of a bullet. The line does not move: a row without an
// expectation word is not a claim, same as a list item without one.
test('a table row carrying an explicit expectation word is a claim', () => {
  const md = [
    '# Runbook',
    '',
    '## Health check',
    '',
    '| Component | Expectation |',
    '|---|---|',
    '| Database | Status should be "ok" |',
    '| Scheduler | Last activity < 30 minutes ago |',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  const texts = claims.map((c) => c.text);
  expect(texts.some((t) => t.includes('Status should be "ok"'))).toBe(true);
  // The sibling row carries no expectation word and must not be invented.
  expect(texts.some((t) => t.includes('Scheduler'))).toBe(false);
  expect(claims.length).toBe(1);
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
