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
});
