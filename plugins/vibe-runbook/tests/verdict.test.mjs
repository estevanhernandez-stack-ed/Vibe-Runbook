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

// The shape check must run before the cost check and before the check result
// is consulted at all. A receipt with a nonzero cost and a failing check is
// still QUESTION -- not SPENDS, not FAIL. If a future refactor reorders the
// shape check against the cost check, this is the test that catches it while
// every other test in this file stays green.
test('a receipt with a nonzero cost and a failing check is still QUESTION, not SPENDS or FAIL', () => {
  const c = assignVerdict(
    { ...base, shape: 'receipt', cost: { raw: 'spends one check', count: 1 } },
    { ok: false, evidence: 'now 12, was 17' }
  );
  expect(c.verdict).toBe('QUESTION');
  expect(c.verdict).not.toBe('SPENDS');
  expect(c.verdict).not.toBe('FAIL');
});

// Fix 9 (2026-08-14 final review): wouldCost aggregated every claim carrying
// a nonzero cost, regardless of what verdict it actually landed. A receipt or
// an unknown sitting under a `spends one check` heading became QUESTION via
// the shape gate -- it was never a candidate to spend on -- and still showed
// up in "what a full walk would cost". The report then quoted a price for
// something it would never buy, in a tool whose only product is being honest
// about numbers.
test('a claim that never became SPENDS contributes nothing to what a full walk would cost', () => {
  const s = summarize([
    { shape: 'receipt', verdict: 'QUESTION', cost: { raw: 'spends one check', count: 1 } },
    { shape: 'unknown', verdict: 'QUESTION', cost: { raw: 'spends one sweep', count: 1 } },
    { shape: 'human', verdict: 'HUMAN', cost: { raw: 'spends one check', count: 1 } },
  ]);
  expect(s.wouldCost).toEqual({});
});

test('the price counts SPENDS only, even when a cheaper shape shares its heading', () => {
  const s = summarize([
    { shape: 'pin', verdict: 'SPENDS', cost: { raw: 'spends one check', count: 1 } },
    { shape: 'receipt', verdict: 'QUESTION', cost: { raw: 'spends one check', count: 1 } },
  ]);
  expect(s.wouldCost).toEqual({ 'spends one check': 1 });
});

// Fix 10 (2026-08-14 final review): the BLOCKED paths set verdict and evidence
// and left checkedAt alone, so a claim that PASSed at 17:55 and blocked on the
// next walk still reported it was checked at 17:55. A stale timestamp on a
// staleness detector is the one lie it cannot afford.
test('a BLOCKED verdict clears the timestamp a previous PASS left behind', () => {
  const passed = { ...base, verdict: 'PASS', evidence: 'x', checkedAt: '2026-08-14T17:55:00.000Z' };

  expect(assignVerdict(passed, { blocked: 'credential missing' }).checkedAt).toBeNull();
  expect(assignVerdict(passed, null).checkedAt).toBeNull();
});

test('summarize handles a claim with a null cost.raw without a "null" key or throwing', () => {
  expect(() =>
    summarize([{ shape: 'unknown', verdict: 'QUESTION', cost: { raw: null, count: null } }])
  ).not.toThrow();

  const s = summarize([{ shape: 'unknown', verdict: 'QUESTION', cost: { raw: null, count: null } }]);
  expect(s.wouldCost).toEqual({});
  expect(Object.prototype.hasOwnProperty.call(s.wouldCost, 'null')).toBe(false);
});
