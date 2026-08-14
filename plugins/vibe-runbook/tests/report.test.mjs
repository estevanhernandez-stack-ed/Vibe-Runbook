import { renderReport } from '../engine/report.mjs';

const claims = [
  { id: 'c-001', shape: 'pin', venue: 'executable', text: 'Revision `x`', verdict: 'FAIL', evidence: 'now y', cost: { raw: 'no spend', count: 0 } },
  { id: 'c-002', shape: 'receipt', text: 'all 17 rooms', verdict: 'QUESTION', cost: { raw: null, count: null } },
  { id: 'c-003', shape: 'pin', venue: 'executable', text: 'sweep works', verdict: 'SPENDS', cost: { raw: 'spends one check', count: 1 } },
];

test('states coverage as a fraction of what was enumerated', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: { totalBlocks: 40, markedBlocks: 3, confidence: 'high' } });
  expect(out).toMatch(/checked 1 of 3/);
});

test('names what a full walk would have cost, in the runbook wording', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {} });
  expect(out).toContain('spends one check');
});

test('offers both exits, so the report is a decision and not a dead end', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {} });
  expect(out).toMatch(/authorize/i);
  expect(out).toMatch(/rewrite/i);
});

test('names the remediation available for a stale pin without firing it', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {} });
  expect(out).toContain('value-to-command');
  expect(out).toMatch(/:remediate/);
});

test('a low-confidence extraction says so at the top', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims: [], coverage: { confidence: 'low', totalBlocks: 40, markedBlocks: 0, guidance: 'mark them' } });
  expect(out).toMatch(/could not read/i);
  expect(out).toContain('mark them');

  // Not just present -- first. The banner outranks the verdicts, so nothing
  // above it should be verdict content. Enforce the order, not just the text.
  const bannerIndex = out.indexOf('Could not read this runbook');
  const checkedIndex = out.indexOf('checked');
  expect(bannerIndex).toBeGreaterThan(-1);
  expect(checkedIndex).toBeGreaterThan(-1);
  expect(bannerIndex).toBeLessThan(checkedIndex);
});

// star-smoke.md, this plugin's own fixture, extracts to markedBlocks: 17,
// totalBlocks: 229, confidence: 'high' -- 92.6% of the document unrecognized,
// and 'high' because the low-confidence threshold is 2%. A report that only
// ever surfaces block counts in the 'low' branch reproduces, on this exact
// fixture, the failure the plugin exists to catch: a walk that checks a
// subset and reports green with no trace of what it skipped.
test('a high-confidence extraction still reports how much of the document it recognized', () => {
  const out = renderReport({
    runbook: 'r.md',
    env: 'live',
    claims,
    coverage: { totalBlocks: 229, markedBlocks: 17, confidence: 'high' },
  });
  expect(out).toMatch(/read 17 of 229/);
  expect(out).toMatch(/checked 1 of 3 enumerated/);
});

test('the two fractions are distinguishable, not just both present', () => {
  const out = renderReport({
    runbook: 'r.md',
    env: 'live',
    claims,
    coverage: { totalBlocks: 229, markedBlocks: 17, confidence: 'high' },
  });
  // Different denominators, different meaning: 17-of-229 is how much of the
  // document was ever recognized as a claim; 1-of-3 is how many of the
  // claims recognized were actually checked. A reader who conflates them
  // reads a mostly-unread document as thoroughly checked.
  expect(out).not.toMatch(/checked 17 of 229/);
  expect(out).not.toMatch(/read 1 of 3/);
});

test('does not fabricate a block-density line when coverage carries no block counts', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {} });
  expect(out).not.toMatch(/read .* content blocks/);
  expect(out).not.toContain('undefined');
});

// Fix 2 (2026-08-14 review): a BLOCKED verdict caused by a gap this tool
// could have been told to close -- no command for a pin, no url for a
// status assertion -- must not dead-end the reader. Genuine environment
// blockers (a failed probe, a broken command) get no invented config fix,
// because there is nothing to configure that helps.
test('a BLOCKED pin missing a command gets a concrete next step, not a dead end', () => {
  const blocked = [
    {
      id: 'c-010', shape: 'pin', venue: 'executable', text: 'Revision `x`',
      verdict: 'BLOCKED', evidence: 'no command for this pin; remediate it or add one to config.pins',
      cost: { raw: null, count: null },
    },
  ];
  const out = renderReport({ runbook: 'r.md', env: 'live', claims: blocked, coverage: {} });
  expect(out).toMatch(/Needs your input to check/);
  expect(out).toContain('config.pins');
  expect(out).toMatch(/:remediate/);
});

test('a BLOCKED status assertion missing a url gets a concrete next step', () => {
  const blocked = [
    {
      id: 'c-011', shape: 'status-assertion', text: 'answers 401 unauthenticated',
      verdict: 'BLOCKED', evidence: 'no url for this status assertion',
      cost: { raw: null, count: null },
    },
  ];
  const out = renderReport({ runbook: 'r.md', env: 'live', claims: blocked, coverage: {} });
  expect(out).toMatch(/Needs your input to check/);
  expect(out).toContain('config.json');
  expect(out).toMatch(/urls/);
});

// ---------------------------------------------------------------------------
// Fixes 1, 2 and 3 (2026-08-14 final review). The report computed the most
// valuable thing it has -- the observed value behind a FAIL -- and threw it
// away, printing `FAIL: 2` and nothing else. It also said nothing whatsoever
// about the 17 QUESTIONs and 2 HUMANs in a 22-claim walk, which is how a wall
// of counts with three actionable lines under it becomes a tool installed once
// and never opened again. Grouping the detail by shape closes the third defect
// for free: a correctly-identified receipt stops being indistinguishable from
// "could not classify", even though both still verdict QUESTION.
// ---------------------------------------------------------------------------

const walked = [
  {
    id: 'c-001', shape: 'pin', venue: 'executable', text: '**Revision `star-00049-j5r`**',
    verdict: 'FAIL', evidence: 'runbook says star-00049-j5r, system says star-00099-NEW',
    cost: { raw: 'no spend', count: 0 }, source: { file: 'star-smoke.md', line: 4 },
  },
  {
    id: 'c-002', shape: 'pin', venue: 'executable', text: 'HEAD `0855bd2`',
    verdict: 'PASS', evidence: '0855bd2 (confirmed)',
    cost: { raw: 'no spend', count: 0 }, source: { file: 'star-smoke.md', line: 5 },
  },
  {
    id: 'c-003', shape: 'status-assertion', venue: 'executable', text: 'Every new route answers 401 unauthenticated',
    verdict: 'BLOCKED', evidence: 'no url for this status assertion',
    cost: { raw: null, count: null }, source: { file: 'star-smoke.md', line: 32 },
  },
  {
    id: 'c-004', shape: 'receipt', venue: 'executable', text: 'The chain walk over all 17 stored rooms',
    verdict: 'QUESTION', evidence: null,
    cost: { raw: null, count: null }, source: { file: 'star-smoke.md', line: 21 },
  },
  {
    id: 'c-005', shape: 'human', venue: 'executable', text: 'Read it on screen, then Ctrl+P and read the PDF',
    verdict: 'HUMAN', evidence: null,
    cost: { raw: null, count: null }, source: { file: 'star-smoke.md', line: 88 },
  },
  {
    id: 'c-006', shape: 'unknown', venue: 'executable', text: 'Your Liverpool export says 58',
    verdict: 'QUESTION', evidence: null,
    cost: { raw: null, count: null }, source: { file: 'star-smoke.md', line: 228 },
  },
];

const walkedReport = () =>
  renderReport({ runbook: 'star-smoke.md', env: 'live', claims: walked, coverage: { totalBlocks: 229, markedBlocks: 22, confidence: 'high' } });

test('a FAIL prints the observed value, not just a count', () => {
  const out = walkedReport();
  expect(out).toContain('runbook says star-00049-j5r, system says star-00099-NEW');
});

test('a PASS prints its evidence too, so a green line can be checked rather than trusted', () => {
  expect(walkedReport()).toContain('0855bd2 (confirmed)');
});

test('every claim reaches the page, including the ones nothing checked', () => {
  const out = walkedReport();
  for (const c of walked) expect(out).toContain(c.id);
  expect(out).toContain('The chain walk over all 17 stored rooms');
  expect(out).toContain('Read it on screen');
  expect(out).toContain('Your Liverpool export says 58');
});

test('every claim carries its verdict and the line it came from', () => {
  const out = walkedReport();
  expect(out).toMatch(/c-001[^\n]*FAIL[^\n]*star-smoke\.md:4/);
  expect(out).toMatch(/c-005[^\n]*HUMAN[^\n]*star-smoke\.md:88/);
});

// Fix 3: verdict.mjs maps receipt and unknown to the same QUESTION, correctly
// -- neither is verifiable. The report is where they have to read differently,
// or the plugin's signature classification is invisible on its only surface.
test('a correctly-identified receipt reads as a receipt, not as "could not classify"', () => {
  const out = walkedReport();
  const receiptHeading = out.indexOf('### receipt');
  const unknownHeading = out.indexOf('### unknown');
  expect(receiptHeading).toBeGreaterThan(-1);
  expect(unknownHeading).toBeGreaterThan(-1);
  expect(receiptHeading).not.toBe(unknownHeading);

  const receiptSection = out.slice(receiptHeading, unknownHeading);
  expect(receiptSection).toContain('c-004');
  expect(receiptSection).not.toContain('c-006');
  expect(receiptSection).toMatch(/never failed/i);
});

test('the unknown group says it was recognized but not classifiable, not that it is fine', () => {
  const out = walkedReport();
  const unknownSection = out.slice(out.indexOf('### unknown'));
  expect(unknownSection).toContain('c-006');
  expect(unknownSection).toMatch(/no rule could classify/i);
});

test('the shape groups render in a fixed order, so two walks diff cleanly', () => {
  const out = walkedReport();
  const order = ['### pin', '### status-assertion', '### receipt', '### human', '### unknown'].map((h) => out.indexOf(h));
  expect(order.every((i) => i > -1)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test('an empty shape group is omitted rather than printed as a zero', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims: [walked[3]], coverage: {} });
  expect(out).toContain('### receipt');
  expect(out).not.toContain('### pin');
  expect(out).not.toContain('### human');
});

// The summary is what the detail hangs off, not something the detail replaces.
test('the counts and both coverage fractions survive the detail section', () => {
  const out = walkedReport();
  expect(out).toMatch(/read 22 of 229/);
  expect(out).toMatch(/checked 2 of 6 enumerated/);
  expect(out).toContain('- FAIL: 1');
  expect(out).toContain('- QUESTION: 2');
});

// "A reader should be able to see what went unread, not just how much."
test('the blocks nobody recognized are named as unchecked, not left as arithmetic', () => {
  const out = walkedReport();
  expect(out).toMatch(/207 blocks/);
});

test('the detail sits above the exits, so the report still ends at the decision', () => {
  const out = walkedReport();
  expect(out.indexOf('### pin')).toBeLessThan(out.indexOf('Needs your input to check'));
});

test('a claim with no source location renders without inventing one', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {} });
  expect(out).not.toContain('undefined');
  expect(out).not.toContain('null:');
});

test('a genuine environment blocker is reported but not given a config fix it cannot use', () => {
  const blocked = [
    {
      id: 'c-012', shape: 'pin', venue: 'executable', text: 'Revision `x`',
      verdict: 'BLOCKED', evidence: 'command failed: not authenticated',
      cost: { raw: null, count: null },
    },
  ];
  const out = renderReport({ runbook: 'r.md', env: 'live', claims: blocked, coverage: {} });
  expect(out).not.toMatch(/Needs your input to check/);
  expect(out).toContain('- BLOCKED: 1');
});
