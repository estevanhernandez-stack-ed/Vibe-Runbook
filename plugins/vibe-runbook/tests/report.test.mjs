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
