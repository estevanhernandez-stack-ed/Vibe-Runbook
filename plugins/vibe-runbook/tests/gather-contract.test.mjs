import { FACT_KINDS, makeEvidence, runGatherers } from '../engine/gather/contract.mjs';

test('fact kinds are fixed and frozen', () => {
  expect(FACT_KINDS).toContain('run-command');
  expect(FACT_KINDS).toContain('deploy-command');
  expect(FACT_KINDS).toContain('env-key');
  expect(Object.isFrozen(FACT_KINDS)).toBe(true);
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
