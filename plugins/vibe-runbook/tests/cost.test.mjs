import { parseCost } from '../engine/cost.mjs';

test('lifts the runbook wording verbatim', () => {
  expect(parseCost('## 1. The sweep survives a reload · 2 min · no spend').raw).toBe('no spend');
  expect(parseCost('## 7. Nothing regressed · 2 min · spends one check').raw).toBe('spends one check');
});

test('parses a count only when unambiguous', () => {
  expect(parseCost('· no spend').count).toBe(0);
  expect(parseCost('· spends one check').count).toBe(1);
  expect(parseCost('· spends 3 checks').count).toBe(3);
  expect(parseCost('· one step spends').count).toBeNull();
});

test('a section with no cost annotation is null, not zero', () => {
  expect(parseCost('## 6. Continuation stacking')).toEqual({ raw: null, count: null });
});
