import { readFileSync } from 'node:fs';
import { extractClaims } from '../engine/extract.mjs';

// Two real runbooks from sibling repos, copied with their structure and every
// marker verbatim (not synthesized). discord-ops-runbook.md had its identifiers
// scrubbed in 0.2.1 (guild ids, app id, invite URL, decision id, estate paths,
// owner's name); no marker word, bold span or list shape changed, which is why
// its claim baseline below is unchanged.
// the same way star-smoke.md is a real STAR document rather than a fixture
// invented for this suite. Their job is the opposite of star-smoke.md's:
// prove the marker widening did not become inference. If either of these
// starts producing claims from ordinary prose with no explicit marker word
// in it, the widening went too far.

const manifestFeed = readFileSync(
  new URL('./fixtures/manifest-feed-runbook.md', import.meta.url),
  'utf8',
);
const discord = readFileSync(
  new URL('./fixtures/discord-ops-runbook.md', import.meta.url),
  'utf8',
);

// A clean negative control, before and after this change: zero occurrences
// of any of the eight required phrases anywhere in the document (checked by
// hand with a plain-text grep before writing this test), so the widening
// has nothing to catch here.
test('manifest-feed-runbook.md — a real runbook with no expectation words — still yields zero claims', () => {
  const { claims, coverage } = extractClaims(manifestFeed, 'tests/fixtures/manifest-feed-runbook.md');
  expect(claims.length).toBe(0);
  expect(coverage.confidence).toBe('low');
});

// NOT a clean negative control, and this test says so rather than pretending
// otherwise. Verified directly (not assumed): even on the unmodified engine,
// before any of this change's code existed, this file already produced 8
// claims at *high* confidence -- unrelated pre-existing behavior, the same
// bold-span preamble recognizer that reads star-smoke.md's own blockquote,
// firing on this file's "**Mirror for coverage.**" / "**Design +
// decisions:**" / "**Revision**" (a section-name cross-reference, not a
// system revision) spans. That is a separate, out-of-scope finding, not
// something this task introduced or is fixing.
//
// What this widening actually adds on top of that pre-existing baseline is
// exactly one new claim: "- **Verify:** `claude mcp get discord` should
// read connected." -- a genuine list-item-shaped explicit "should read"
// marker, structurally identical to every positive control this feature
// targets. That is the widening working correctly, not over-triggering; an
// explicit marker word is exactly the signal the spec requires. This test
// pins both facts: the pre-existing baseline is untouched, and the prose
// mechanism contributes precisely one claim, from precisely that line.
test('discord-ops-runbook.md — the widening adds exactly one genuine claim on top of a pre-existing (unrelated) baseline', () => {
  const { claims, coverage } = extractClaims(discord, 'tests/fixtures/discord-ops-runbook.md');

  const proseClaims = claims.filter((c) => c.marker === 'prose');
  expect(proseClaims.length).toBe(1);
  expect(proseClaims[0].text).toContain('should read connected');

  // The pre-existing preamble baseline (unrelated to this change) plus the
  // one genuine prose catch.
  expect(claims.length).toBe(9);
  expect(coverage.confidence).toBe('high');
});
