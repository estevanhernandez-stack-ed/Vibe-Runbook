import { assignVerdict, summarize } from '../engine/verdict.mjs';

const base = { id: 'c-001', shape: 'pin', cost: { raw: 'no spend', count: 0 } };

test('a receipt is NEVER failed, whatever the check said', () => {
  const c = assignVerdict({ ...base, shape: 'receipt' }, { ok: false, evidence: 'now 12, was 17' });
  expect(c.verdict).not.toBe('FAIL');
  expect(c.verdict).toBe('QUESTION');
});

test('a human claim is named, never scored as a pass', () => {
  const c = assignVerdict({ ...base, shape: 'human' }, { ok: true });
  expect(c.verdict).toBe('HUMAN');
});

test('an unknown claim becomes QUESTION, never a guess', () => {
  const c = assignVerdict({ ...base, shape: 'unknown' }, { ok: true });
  expect(c.verdict).toBe('QUESTION');
});

test('a claim that would cost money is SPENDS and is never checked', () => {
  const c = assignVerdict({ ...base, cost: { raw: 'spends one check', count: 1 } }, null);
  expect(c.verdict).toBe('SPENDS');
});

test('a pin with a passing check is PASS and carries evidence', () => {
  const c = assignVerdict(base, { ok: true, evidence: 'star-00052-7jb' });
  expect(c.verdict).toBe('PASS');
  expect(c.evidence).toBe('star-00052-7jb');
});

test('a pin with a failing check is FAIL', () => {
  expect(assignVerdict(base, { ok: false, evidence: 'x' }).verdict).toBe('FAIL');
});

test('an unreachable check is BLOCKED, not FAIL', () => {
  expect(assignVerdict(base, { blocked: 'credential missing' }).verdict).toBe('BLOCKED');
});

test('summarize totals what a full walk would have cost, grouped by raw unit', () => {
  const s = summarize([
    { shape: 'pin', verdict: 'PASS', cost: { raw: 'no spend', count: 0 } },
    { shape: 'pin', verdict: 'SPENDS', cost: { raw: 'spends one check', count: 1 } },
    { shape: 'pin', verdict: 'SPENDS', cost: { raw: 'spends one check', count: 1 } },
  ]);
  expect(s.counts.SPENDS).toBe(2);
  expect(s.wouldCost).toEqual({ 'spends one check': 2 });
});
