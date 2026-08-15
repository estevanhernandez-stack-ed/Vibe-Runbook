import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorRunbook } from '../engine/author.mjs';

const fullFixture = fileURLToPath(new URL('./fixtures/app-full/', import.meta.url));
// `env` is load-bearing now, not decoration: without it nothing is probed at
// all and the health section composes to a stub (Fix 1, 2026-08-14
// whole-branch review). 'prod' is a key the fixture's agent-access.json
// actually carries.
const ctx = (root) => ({
  projectRoot: root,
  appName: 'demo-app',
  env: 'prod',
  runCommand: () => 'abc1234',
  probeUrl: () => 200,
});

function scratch() {
  const d = mkdtempSync(join(tmpdir(), 'vrb-author-'));
  cpSync(fullFixture, d, { recursive: true });
  return d;
}

test('writes a runbook when none exists', async () => {
  const d = scratch();
  const r = await authorRunbook(ctx(d));
  expect(r.wrote).toBe(true);
  expect(existsSync(join(d, 'docs', 'RUNBOOK.md'))).toBe(true);
  expect(readFileSync(join(d, 'docs', 'RUNBOOK.md'), 'utf8')).toContain('demo-app');
});

test('NEVER overwrites an existing runbook', async () => {
  const d = scratch();
  mkdirSync(join(d, 'docs'), { recursive: true });
  const existing = '# My hand-written runbook\n\nDo not touch.\n';
  writeFileSync(join(d, 'docs', 'RUNBOOK.md'), existing, 'utf8');

  const r = await authorRunbook(ctx(d));
  expect(r.wrote).toBe(false);
  expect(readFileSync(join(d, 'docs', 'RUNBOOK.md'), 'utf8')).toBe(existing);
  expect(existsSync(r.outPath)).toBe(true);
  expect(r.outPath).not.toBe(join(d, 'docs', 'RUNBOOK.md'));
});

// Was a tripwire pointed at the wrong file (2026-08-14 whole-branch review):
// it wrote a `.env` no gatherer opens, then asserted toContain('API_KEY') --
// which passed off the fixture's own .env.example, not off the file under
// test. The real invariant has two halves and both are asserted here: the
// file that IS read yields key names and never values, and a `.env` is not a
// source at all, key or value.
test('no .env.example value ever reaches the emitted document, and .env is not read at all', async () => {
  const d = scratch();
  appendFileSync(join(d, '.env.example'), 'SENTINEL_KEY=SENTINEL-VALUE-DO-NOT-EMIT\n', 'utf8');
  writeFileSync(join(d, '.env'), 'PRIVATE_ONLY_KEY=ALSO-DO-NOT-EMIT\n', 'utf8');

  const r = await authorRunbook(ctx(d));

  expect(r.markdown).toContain('SENTINEL_KEY');
  expect(r.markdown).not.toContain('SENTINEL-VALUE-DO-NOT-EMIT');
  expect(r.markdown).not.toContain('PRIVATE_ONLY_KEY');
  expect(r.markdown).not.toContain('ALSO-DO-NOT-EMIT');
});

// Widened (2026-08-14 whole-branch review): filtering on FAIL alone let a
// BLOCKED-at-birth claim through, which is the exact case that then renders
// as a bare confident assertion. Any non-PASS verdict is a defect in the
// generator on a fixture this complete. `null` is not a verdict -- a step
// with verify.type 'none' was never checked and never claimed to be.
test('the generated runbook passes its own walk at birth, on every checked claim', async () => {
  const d = scratch();
  const r = await authorRunbook(ctx(d));
  const checked = r.sections.flatMap((s) => s.drafts).filter((x) => x.verdict !== null);
  expect(checked.length).toBeGreaterThan(0);
  expect(checked.filter((x) => x.verdict !== 'PASS')).toEqual([]);
});

test('an app with nothing to gather still produces an honest document', async () => {
  const d = mkdtempSync(join(tmpdir(), 'vrb-bare-'));
  writeFileSync(join(d, 'README.md'), '# bare\n', 'utf8');
  const r = await authorRunbook(ctx(d));
  expect(r.markdown).toMatch(/Unwritten:/);
  expect(r.markdown).toMatch(/Not gathered/);
});

// ---------------------------------------------------------------------------
// Fix 1 + Fix 2 (2026-08-14 whole-branch review). They compose: once the env
// is explicit, :author knows exactly which url it probed, so it can record
// that url where the next walk will look for it.
// ---------------------------------------------------------------------------

// Reproduced with live listeners before the fix: no --env, two base urls,
// no token -- and :author hit PROD, unauthenticated, then wrote
// "**Right:** /health answers 200." down as a PASS.
test('with no env named, nothing is probed and the health section is a question', async () => {
  const d = scratch();
  let probes = 0;
  const r = await authorRunbook({ ...ctx(d), env: undefined, probeUrl: async () => { probes += 1; return 200; } });

  expect(probes).toBe(0);
  const health = r.sections.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
  expect(r.markdown).not.toMatch(/answers 200/);
});

test('the named env decides which host is probed, not the manifest ordering', async () => {
  const d = scratch();
  const probed = [];
  await authorRunbook({ ...ctx(d), env: 'dev', probeUrl: async (u) => { probed.push(u); return 200; } });
  expect(probed).toEqual(['http://localhost:5001/api/health']);
});

// The whole composition story -- author writes it, walk keeps it true -- was
// false for the only non-pin assertion :author can produce: compose put the
// full url in verify.url, only the bare path reached the page, nothing ever
// populates claim.url, and the walk therefore reported
// "BLOCKED - no url for this status assertion" forever, on a document whose
// generator had the url in hand.
test('the url it probed is recorded in config.json under the id a later scan will assign', async () => {
  const d = scratch();
  const r = await authorRunbook(ctx(d));

  const config = JSON.parse(readFileSync(join(d, '.vibe-runbook', 'config.json'), 'utf8'));
  const ids = Object.keys(config.urls ?? {});
  expect(ids.length).toBe(1);
  expect(config.urls[ids[0]]).toBe('https://demo.example.com/api/health');

  // The id is not asserted literally -- it has to be the one scan actually
  // assigns to this claim, which is the only thing that makes the entry
  // resolvable on the next walk.
  const { scanRunbook } = await import('../engine/scan.mjs');
  const scanned = scanRunbook(readFileSync(r.outPath, 'utf8'), r.outPath);
  const status = scanned.claims.find((c) => c.shape === 'status-assertion');
  expect(status).toBeDefined();
  expect(ids).toContain(status.id);
});

test('an existing config is merged into, never clobbered', async () => {
  const d = scratch();
  mkdirSync(join(d, '.vibe-runbook'), { recursive: true });
  writeFileSync(
    join(d, '.vibe-runbook', 'config.json'),
    JSON.stringify({ pins: { revision: 'gcloud run services describe demo' }, urls: { 'c-999': 'https://kept.example.com' } }, null, 2),
  );

  await authorRunbook(ctx(d));

  const config = JSON.parse(readFileSync(join(d, '.vibe-runbook', 'config.json'), 'utf8'));
  expect(config.pins.revision).toBe('gcloud run services describe demo');
  expect(config.urls['c-999']).toBe('https://kept.example.com');
  expect(Object.values(config.urls)).toContain('https://demo.example.com/api/health');
});

test('nothing probed means no config file is invented', async () => {
  const d = scratch();
  await authorRunbook({ ...ctx(d), env: undefined });
  expect(existsSync(join(d, '.vibe-runbook', 'config.json'))).toBe(false);
});

// ---------------------------------------------------------------------------
// Fix A (CRITICAL, 2026-08-14 re-review): --env gated whether a probe
// happened, not where it went. An affordance whose path is already a full
// url skipped the base-url join, so --env prod against a manifest carrying
// an absolute localhost path sent the PROD bearer token to 127.0.0.1 over
// plain HTTP. Asserted here at the level the token actually travels: the
// probe is never called at all.
// ---------------------------------------------------------------------------

test('an absolute health path on another origin is never probed under a named env', async () => {
  const d = scratch();
  const manifestPath = join(d, 'agent-access.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // prod is a real remote host; the affordance points at the operator's box.
  manifest.affordances[0].path = 'http://127.0.0.1:8792/api/health';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  let probes = 0;
  const r = await authorRunbook({ ...ctx(d), probeUrl: async () => { probes += 1; return 200; } });

  expect(probes).toBe(0);
  const health = r.sections.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
  expect(existsSync(join(d, '.vibe-runbook', 'config.json'))).toBe(false);
});

// ---------------------------------------------------------------------------
// Fix B (CRITICAL, 2026-08-14 re-review): the config write ran BEFORE the
// never-clobber branch, so on any project that already has a runbook -- the
// common case -- the ids came from the proposal while :scan and :walk read
// the operator's own document. Both id sequences start at c-001, so the url
// landed on whatever claim occupied that slot in a document it does not
// describe, and the operator's claim about a billing endpoint was reported
// PASS on the strength of a probe of a health endpoint.
//
// This is the reproduction with no hand-merging: :author, then scan and walk
// the OPERATOR's file.
// ---------------------------------------------------------------------------

const operatorRunbook = [
  '# Ops runbook',
  '',
  '> Written by a person, not by this tool.',
  '> - HEAD — run: `git rev-parse --short HEAD`',
  '',
  '## Is it up',
  '',
  '**Right:** `/api/internal/billing-drain` answers 200.',
  '',
].join('\n');

test('a proposal never teaches the walker anything about the document it does not describe', async () => {
  const { runWalk } = await import('../engine/cli.mjs');
  const { scanRunbook } = await import('../engine/scan.mjs');

  const d = scratch();
  mkdirSync(join(d, 'docs'), { recursive: true });
  const operatorPath = join(d, 'docs', 'RUNBOOK.md');
  writeFileSync(operatorPath, operatorRunbook, 'utf8');

  const r = await authorRunbook(ctx(d));
  expect(r.wrote).toBe(false);
  expect(r.configPath).toBeNull();
  expect(existsSync(join(d, '.vibe-runbook', 'config.json'))).toBe(false);

  // The collision is real -- both documents put a status assertion at c-002 --
  // which is exactly why deriving ids from one and walking the other lies.
  const proposal = scanRunbook(readFileSync(r.outPath, 'utf8'), r.outPath);
  const operator = scanRunbook(readFileSync(operatorPath, 'utf8'), operatorPath);
  const proposalStatus = proposal.claims.find((c) => c.shape === 'status-assertion');
  const operatorStatus = operator.claims.find((c) => c.shape === 'status-assertion');
  expect(proposalStatus.id).toBe(operatorStatus.id);
  expect(operatorStatus.text).toMatch(/billing-drain/);

  const probed = [];
  const walked = await runWalk(operator, {}, {
    runCommand: () => 'abc1234',
    probeUrl: async (u) => { probed.push(u); return 200; },
  });

  // Nothing of the operator's was probed, and no claim of theirs carries
  // evidence borrowed from a document they never adopted.
  expect(probed).toEqual([]);
  const billing = walked.find((c) => c.id === operatorStatus.id);
  expect(billing.verdict).toBe('BLOCKED');
  expect(billing.verdict).not.toBe('PASS');
  expect(billing.evidence ?? '').not.toMatch(/api\/health/);
  expect(JSON.stringify(walked)).not.toMatch(/demo\.example\.com/);
});

// The other half of the same rule: when :author DID write the target, the
// config it leaves behind describes that exact file.
test('when the target was written, the config describes the file that was written', async () => {
  const { scanRunbook } = await import('../engine/scan.mjs');
  const d = scratch();

  const r = await authorRunbook(ctx(d));
  expect(r.wrote).toBe(true);

  const config = JSON.parse(readFileSync(r.configPath, 'utf8'));
  const scanned = scanRunbook(readFileSync(r.outPath, 'utf8'), r.outPath);
  const status = scanned.claims.find((c) => c.shape === 'status-assertion');
  expect(Object.keys(config.urls)).toEqual([status.id]);
});

// ---------------------------------------------------------------------------
// Coordinator review, round 2. Five fixes; the three that live at the
// authorRunbook level get their regression tests here. Fix 3 (--out
// resolved against --project) and Fix 5 (walk forwards state.stubs) are
// cli.mjs wiring, not authorRunbook behavior, so they get CLI-level tests
// in cli.test.mjs instead.
// ---------------------------------------------------------------------------

// Fix 1 (CRITICAL): `target.replace(/\.md$/, suffix)` returns the string
// UNCHANGED when the target doesn't end in a lowercase ".md" -- so
// `proposal === target` for a bare name, a ".markdown" name, or an
// uppercase ".MD" name, and the "never clobber" branch wrote the generated
// document straight onto the file it was supposed to protect, while still
// reporting wrote:false and printing "was NOT overwritten". Asserted on the
// file's bytes, not on the returned flag -- the flag was exactly what lied.
describe('the proposal path never collides with the target, regardless of extension', () => {
  test.each(['RUNBOOK', 'RUNBOOK.markdown', 'RUNBOOK.MD'])('--out %s', async (name) => {
    const d = scratch();
    const target = join(d, name);
    const existing = '# My hand-written runbook\n\nDo not touch.\n';
    writeFileSync(target, existing, 'utf8');

    const r = await authorRunbook({ ...ctx(d), out: target });

    expect(r.wrote).toBe(false);
    expect(r.outPath).not.toBe(target);
    // The file on disk, not the claimed flag -- this is what Fix 1 actually
    // broke: byte-identical to what was there before authorRunbook ran.
    expect(readFileSync(target, 'utf8')).toBe(existing);
    expect(existsSync(r.outPath)).toBe(true);
    expect(readFileSync(r.outPath, 'utf8')).toContain('demo-app');
  });
});

// Fix 2 (CRITICAL): verifyStatus's httpProbe contract is synchronous, but
// the real CLI wires `probeUrl: makeProbe(...)`, which is async. Every test
// above stubs `probeUrl: () => 200` -- synchronous -- which is exactly why
// 228 green hid this: authorRunbook used to hand an unawaited Promise
// straight to verifyStatus, so every health claim read `[object Promise]`
// and FAILed at the moment the document claims it already passed.
test('an async probeUrl (the real makeProbe shape) is awaited before verifying, not read as [object Promise]', async () => {
  const d = scratch();
  const r = await authorRunbook({ ...ctx(d), probeUrl: async (url) => 200 });

  const health = r.sections.find((s) => s.id === 'health');
  const assertion = health.drafts.find((x) => x.kind === 'status-assertion');
  expect(assertion).toBeDefined();
  expect(assertion.verdict).toBe('PASS');
  expect(assertion.evidence).not.toMatch(/Promise/);
  expect(r.markdown).not.toMatch(/\[object Promise\]/);
  expect(r.markdown).not.toMatch(/FAIL/);
});

// Fix 4 (Important): the real runbook is protected on every run via
// backupFile before the never-clobber branch writes to the proposal path --
// but a THIRD run against an already-proposed app used to overwrite the
// SECOND run's proposal with no backup at all, silently destroying whatever
// a person was mid-review on.
test('a pre-existing proposal is backed up before a later run replaces it', async () => {
  const d = scratch();
  mkdirSync(join(d, 'docs'), { recursive: true });
  writeFileSync(join(d, 'docs', 'RUNBOOK.md'), '# Hand-written\n', 'utf8');

  const first = await authorRunbook(ctx(d));
  const firstProposal = readFileSync(first.outPath, 'utf8');

  // Simulate a person having started editing the first proposal.
  writeFileSync(first.outPath, `${firstProposal}\n<!-- reviewer notes -->\n`, 'utf8');
  const editedProposal = readFileSync(first.outPath, 'utf8');

  const second = await authorRunbook(ctx(d));

  expect(second.outPath).toBe(first.outPath);
  // The edited proposal was overwritten by the second run's output...
  expect(readFileSync(second.outPath, 'utf8')).not.toBe(editedProposal);
  // ...but not without a backup capturing exactly what was there.
  const backups = readdirSync(join(d, 'docs')).filter(
    (f) => f.includes('.vibe-runbook-proposal.md.vibe-runbook-') && f.endsWith('.bak'),
  );
  expect(backups.length).toBeGreaterThan(0);
  const backedUp = readFileSync(join(d, 'docs', backups[0]), 'utf8');
  expect(backedUp).toBe(editedProposal);
});
