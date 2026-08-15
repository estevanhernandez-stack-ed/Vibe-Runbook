import { FACT_KINDS, makeEvidence, runGatherers } from '../engine/gather/contract.mjs';

test('fact kinds are fixed and frozen', () => {
  expect(FACT_KINDS).toContain('run-command');
  expect(FACT_KINDS).toContain('deploy-command');
  expect(FACT_KINDS).toContain('env-key');
  expect(Object.isFrozen(FACT_KINDS)).toBe(true);
});

// Fix 4 (2026-08-14 whole-branch review). `revision-command` was consumed by
// compose.mjs and emitted by no gatherer, and the only producer available
// for it -- git -- already emits `head-command` naming the same command, so
// wiring it would have meant a second header pin that duplicates the first.
// A vocabulary entry connected to nothing is a wishlist wearing a schema's
// clothes; it is gone rather than filled with a duplicate. The kind being
// absent is what makes a stray emitter fail loudly instead of silently.
test('revision-command is not a fact kind, and emitting one is refused', () => {
  expect(FACT_KINDS).not.toContain('revision-command');
  expect(() => makeEvidence('git', { facts: [{ kind: 'revision-command', key: 'r', value: 'x', source: 'git' }] }))
    .toThrow(/unknown fact kind/i);
});

test('makeEvidence rejects an unknown fact kind rather than passing it through', () => {
  expect(() => makeEvidence('source', { facts: [{ kind: 'nonsense', key: 'x', value: 'y', source: 'f' }] }))
    .toThrow(/unknown fact kind/i);
});

test('a gatherer that throws is skipped with a gap, never crashes the run', () => {
  const boom = { name: 'boom', run: () => { throw new Error('no git here'); } };
  const fine = { name: 'fine', run: () => makeEvidence('fine', { facts: [], gaps: [] }) };
  const out = runGatherers([boom, fine], {});
  expect(out.ran).toEqual(['fine']);
  expect(out.skipped).toEqual(['boom']);
  expect(out.gaps.some((g) => /boom/.test(g) && /no git here/.test(g))).toBe(true);
});

test('facts and gaps from every gatherer are merged', () => {
  const a = { name: 'a', run: () => makeEvidence('a', { facts: [{ kind: 'port', key: 'web', value: '3000', source: 'p.json' }], gaps: ['no Dockerfile'] }) };
  const b = { name: 'b', run: () => makeEvidence('b', { facts: [{ kind: 'env-key', key: 'API_KEY', value: '', source: '.env.example' }], gaps: [] }) };
  const out = runGatherers([a, b], {});
  expect(out.facts).toHaveLength(2);
  expect(out.gaps).toEqual(['no Dockerfile']);
});

test('a hand-rolled evidence object with an unknown kind is skipped at the seam, never merged', () => {
  // Bypasses makeEvidence entirely — its refusal only fires when a gatherer
  // routes its return through it. runGatherers must re-check at the seam
  // itself, or a typo'd kind merges silently as if it were legitimate.
  const bad = {
    name: 'bad',
    run: () => ({ gatherer: 'bad', ok: true, facts: [{ kind: 'run-commnd', key: 'x', value: 'y', source: 'z' }], gaps: [] }),
  };
  const fine = { name: 'fine', run: () => makeEvidence('fine', { facts: [], gaps: [] }) };
  const out = runGatherers([bad, fine], {});
  expect(out.ran).toEqual(['fine']);
  expect(out.skipped).toEqual(['bad']);
  expect(out.facts).toHaveLength(0);
  expect(out.gaps.some((g) => /bad/.test(g) && /run-commnd/.test(g))).toBe(true);
});

test('a gatherer whose run() returns undefined is skipped, and the rest of the batch still runs', () => {
  // Regression: an earlier version of runGatherers narrowed its try to just
  // the g.run(ctx) call, leaving the shape check and the merge outside it.
  // A gatherer returning undefined threw an uncaught TypeError reading
  // ev.facts, which crashed the whole runGatherers call — every gatherer
  // after "broken" never ran, not just "broken" itself. Asserting only
  // "it didn't throw" would miss that; assert "fine" still ran and its
  // facts still landed.
  const broken = { name: 'broken', run: () => undefined };
  const fine = {
    name: 'fine',
    run: () => makeEvidence('fine', { facts: [{ kind: 'port', key: 'web', value: '3000', source: 'p.json' }], gaps: [] }),
  };
  const out = runGatherers([broken, fine], {});
  expect(out.skipped).toEqual(['broken']);
  expect(out.ran).toEqual(['fine']);
  expect(out.facts).toEqual([{ kind: 'port', key: 'web', value: '3000', source: 'p.json' }]);
  expect(out.gaps.some((g) => /broken/.test(g))).toBe(true);
});

test('a gatherer whose run() returns an object with no facts property is skipped, and the rest of the batch still runs', () => {
  const broken = { name: 'broken', run: () => ({ gatherer: 'broken', ok: true, gaps: [] }) };
  const fine = {
    name: 'fine',
    run: () => makeEvidence('fine', { facts: [{ kind: 'env-key', key: 'API_KEY', value: '', source: '.env.example' }], gaps: [] }),
  };
  const out = runGatherers([broken, fine], {});
  expect(out.skipped).toEqual(['broken']);
  expect(out.ran).toEqual(['fine']);
  expect(out.facts).toEqual([{ kind: 'env-key', key: 'API_KEY', value: '', source: '.env.example' }]);
  expect(out.gaps.some((g) => /broken/.test(g))).toBe(true);
});
