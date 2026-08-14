import { extractClaims } from '../engine/extract.mjs';

// Round 3, Fix 1 (CRITICAL): an unterminated fence must never silently
// swallow the rest of the document. Before this fix, once `fence` was set
// in groupIntoUnits it stayed set for the remainder of the walk -- every
// later line hit `continue`, no further unit was ever built, and
// countContentLines kept counting the swallowed lines regardless, so the
// denominator hid the loss entirely. A short document could read
// `confidence: 'high'` on a fraction of its real claims: the false-clean
// read, the one defect class this tool cannot ship with. Detected once, up
// front, and reported loudly rather than silently.
test('an unterminated fence forces low confidence with guidance naming its line, and does not lose claims found before it', () => {
  const md = [
    '# Runbook',
    '',
    '## Checks',
    '',
    '1. First check: should be green.',
    '2. Second check:',
    '   ```bash',
    '   echo "this fence is never closed"',
    '3. Third check: should be blue.',
  ].join('\n');

  const { claims, coverage } = extractClaims(md, 'test.md');
  expect(coverage.confidence).toBe('low');
  expect(coverage.guidance).toMatch(/never closed|unterminated/i);
  expect(coverage.guidance).toContain('test.md');
  expect(coverage.guidance).toMatch(/\b7\b/); // the fence opened on physical line 7
  // The claim found before the fence opened must survive -- forcing low
  // confidence is not license to also discard what was legitimately read.
  expect(claims.some((c) => c.text.includes('should be green'))).toBe(true);
  // Everything after the unterminated fence was never read and must not be
  // fabricated into existence.
  expect(claims.some((c) => c.text.includes('should be blue'))).toBe(false);
});

// Reachable a second way: CommonMark forbids an info string on a *closing*
// fence delimiter -- a closing line may carry only the fence characters and
// trailing whitespace. Accepting one let an illustrated nested-fence
// example (a runbook showing what fenced markdown looks like) close the
// outer fence early on its own inner "```bash", expose that illustration to
// ordinary prose scanning, and then re-open a phantom fence on what should
// have been the outer fence's real close -- silently swallowing everything
// written after it. Rejecting an info string on the closer keeps the outer
// fence open through its own illustration and lets its real bare closer
// end it correctly.
test('a closing fence delimiter with trailing text does not close the fence', () => {
  const md = [
    '# Runbook',
    '',
    '## Example',
    '',
    '```markdown',
    '```bash',
    'echo hello',
    '```',
    '- Real check: should be green.',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  expect(claims.some((c) => c.text.includes('should be green'))).toBe(true);
});

// Reachable a third way: CommonMark caps fence-opener indentation at 3
// spaces -- a 4-space indent belongs to an indented code block, not a
// fence. Left uncapped, a 4-space-indented ``` inside an ordinary
// paragraph (an author showing literal backtick syntax, not opening a real
// fence) opened a phantom fence and swallowed every real line written
// after it, all the way to EOF.
test('a 4-space-indented ``` does not open a phantom fence', () => {
  const md = [
    '# Runbook',
    '',
    '## Example',
    '',
    'Some paragraph mentioning fence syntax:',
    '',
    '    ```',
    "    this looks like a fence but it's 4-space indented",
    '',
    '- Real check: should be green.',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  expect(claims.some((c) => c.text.includes('should be green'))).toBe(true);
});

// A 3-space indent is still a legitimate fence opener (the shape every
// real list-item fence in PriceScout/Reel-Battles actually uses) -- the
// indentation cap must land exactly at CommonMark's boundary, not swallow
// the legitimate case along with the phantom one.
test('a 3-space-indented ``` under a list item still opens a real fence', () => {
  const md = [
    '# Runbook',
    '',
    '## Example',
    '',
    '1. Sample output:',
    '   ```bash',
    '   echo "the response should be ok"',
    '   ```',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  expect(claims.length).toBe(0);
});

// Round 3, Fix 2: a bare marker (**Right:**/**Wrong:**/**Expected:**/
// **Should:**) whose very next content is a fence claims the fenced
// interior. Before this widening's fence-awareness even existed, this
// shape produced one claim; round 2's fence-transparency made it produce
// zero, because fenced lines never become a unit at all, so "the next
// unit" lookup skipped straight past it. Expected-output-in-a-fence-under-
// an-Expected-line is mainstream ops idiom, and the author wrote an
// explicit marker for exactly this content.
test('a bare marker directly followed by a fence claims the fenced content', () => {
  const md = [
    '# Runbook',
    '',
    '## Health check',
    '',
    '**Expected:**',
    '```json',
    '{"status":"ok"}',
    '```',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  const claim = claims.find((c) => c.marker === 'expect');
  expect(claim).toBeDefined();
  expect(claim.text).toContain('"status":"ok"');
});

// The fence-claiming path must not fabricate a claim when the fence itself
// never closes -- that is Fix 1's job (force low confidence, name the
// line), not Fix 2's. A bare marker followed by an unterminated fence must
// not silently invent partial or empty text as "the content".
test('a bare marker followed by an unterminated fence does not fabricate a claim; the document reads low confidence instead', () => {
  const md = [
    '# Runbook',
    '',
    '## Health check',
    '',
    '**Expected:**',
    '```json',
    '{"status":"ok"}',
  ].join('\n');

  const { claims, coverage } = extractClaims(md, 'test.md');
  expect(claims.some((c) => c.marker === 'expect')).toBe(false);
  expect(coverage.confidence).toBe('low');
  expect(coverage.guidance).toMatch(/never closed|unterminated/i);
});

// A bare marker with an ordinary (non-fence) list underneath it is Task 1's
// original mechanism and must be completely unaffected by any of this.
test('a bare marker followed by an ordinary list is unaffected by the fence-claiming path', () => {
  const md = [
    '# Runbook',
    '',
    '## Health check',
    '',
    '**Right:**',
    '',
    '- the endpoint answers 200',
    '- the body names the build sha',
  ].join('\n');

  const { claims } = extractClaims(md, 'test.md');
  const texts = claims.map((c) => c.text);
  expect(texts).toContain('the endpoint answers 200');
  expect(texts).toContain('the body names the build sha');
});
