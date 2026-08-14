// A gatherer answers "what evidence can I collect here", never "what framework
// is this". Sources, not stacks — that is what keeps a six-stack portfolio from
// needing six inspectors.
export const FACT_KINDS = Object.freeze([
  'run-command',
  'test-command',
  'deploy-command',
  'rollback-command',
  'log-command',
  'revision-command',
  'head-command',
  'health-path',
  'base-url',
  'route',
  'env-key',
  'port',
]);

export function makeEvidence(gatherer, { facts = [], gaps = [] } = {}) {
  for (const f of facts) {
    if (!FACT_KINDS.includes(f.kind)) {
      throw new Error(`unknown fact kind "${f.kind}" from gatherer "${gatherer}"`);
    }
  }
  return { gatherer, ok: true, facts, gaps };
}

// A gatherer that cannot run is a stated gap, never a silent omission.
export function runGatherers(gatherers, ctx) {
  const facts = [];
  const gaps = [];
  const ran = [];
  const skipped = [];
  for (const g of gatherers) {
    let ev;
    try {
      ev = g.run(ctx);
    } catch (e) {
      skipped.push(g.name);
      gaps.push(`gatherer "${g.name}" could not run: ${e.message}`);
      continue;
    }
    // makeEvidence's refusal only fires when a gatherer routes its return
    // through it. A hand-rolled evidence object can still reach here with a
    // typo'd kind — re-check at the seam and treat it exactly like a throw:
    // skipped, never silently merged as if it were legitimate evidence.
    const badFact = ev.facts.find((f) => !FACT_KINDS.includes(f.kind));
    if (badFact) {
      skipped.push(g.name);
      gaps.push(`gatherer "${g.name}" emitted an unknown fact kind "${badFact.kind}", so its evidence was discarded`);
      continue;
    }
    facts.push(...ev.facts);
    gaps.push(...ev.gaps);
    ran.push(g.name);
  }
  return { facts, gaps, ran, skipped };
}
