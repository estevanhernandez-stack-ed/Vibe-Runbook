import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWalk, makeProbe } from '../engine/cli.mjs';
import { renderReport } from '../engine/report.mjs';

const cli = fileURLToPath(new URL('../engine/cli.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/star-smoke.md', import.meta.url));

test('scan writes claims.json into .vibe-runbook/state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-cli-'));
  const rb = join(dir, 'runbook.md');
  copyFileSync(fixture, rb);
  execFileSync('node', [cli, 'scan', '--runbook', rb], { cwd: dir });
  const out = JSON.parse(readFileSync(join(dir, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  expect(out.schemaVersion).toBe('1.0.0');
  expect(out.claims.length).toBeGreaterThan(0);
});

test('walk refuses to run without a named environment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-cli2-'));
  expect(() => execFileSync('node', [cli, 'walk'], { cwd: dir, stdio: 'pipe' })).toThrow();
});

// Sets up a temp dir with a hand-built claims.json (bypassing scan) plus,
// optionally, a .vibe-runbook/config.json, and runs `walk` with a stub
// credential for the named environment.
function walkDir({ claims, config, env = 'stub' }) {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-cli-walk-'));
  mkdirSync(join(dir, '.vibe-runbook', 'state'), { recursive: true });
  const state = {
    schemaVersion: '1.0.0',
    runbook: 'runbook.md',
    coverage: { extracted: claims.length, markedBlocks: claims.length, totalBlocks: claims.length, confidence: 'high', guidance: null },
    claims,
  };
  writeFileSync(join(dir, '.vibe-runbook', 'state', 'claims.json'), JSON.stringify(state, null, 2));
  if (config) writeFileSync(join(dir, '.vibe-runbook', 'config.json'), JSON.stringify(config, null, 2));

  const out = execFileSync('node', [cli, 'walk', '--env', env], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, [`VIBE_RUNBOOK_${env.toUpperCase()}_TOKEN`]: 'stub-token' },
    timeout: 20_000, // defense in depth: makeProbe's own 10s AbortSignal should always win first
  });
  const written = JSON.parse(readFileSync(join(dir, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  return { report: out, claims: written.claims };
}

// Fix 1 (2026-08-14 review): assignVerdict's cost gate ran AFTER the
// verifier already executed, because `assignVerdict(c, verifyPin(...))`
// evaluates the verifyPin call before assignVerdict is ever entered. This
// walk uses the sentinel technique the reviewer used to catch it live: a
// cost-flagged claim's command writes a marker file, and passing means the
// marker was never written. Bundled with three other shapes in one walk
// because the fix has to hold across all of them at once, not in isolation.
test('walk: self-answering PASS, a cost-flagged claim never runs, a config-resolved pin PASSes, a receipt is QUESTION', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-cli-e2e-'));
  mkdirSync(join(dir, '.vibe-runbook', 'state'), { recursive: true });

  writeFileSync(join(dir, 'sentinel.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('SPENT', 'x');\n");
  writeFileSync(join(dir, 'version.mjs'), "console.log('1.2.3');\n");

  const claims = [
    {
      id: 'c-1', shape: 'pin', venue: 'executable', text: 'Revision — run: `node -e "1"`',
      cost: { raw: 'no spend', count: 0 }, verdict: null, evidence: null, checkedAt: null,
      source: { file: 'runbook.md', line: 1 },
    },
    {
      id: 'c-2', shape: 'pin', venue: 'executable', text: 'Sweep — run: `node sentinel.mjs`',
      cost: { raw: 'spends one check', count: 1 }, verdict: null, evidence: null, checkedAt: null,
      source: { file: 'runbook.md', line: 2 },
    },
    {
      id: 'c-3', shape: 'pin', venue: 'executable', text: 'Version `1.2.3`',
      cost: { raw: 'no spend', count: 0 }, verdict: null, evidence: null, checkedAt: null,
      source: { file: 'runbook.md', line: 3 },
    },
    {
      id: 'c-4', shape: 'receipt', venue: 'executable', text: 'over all 17 rooms',
      cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
      source: { file: 'runbook.md', line: 4 },
    },
  ];
  const state = {
    schemaVersion: '1.0.0', runbook: 'runbook.md',
    coverage: { extracted: 4, markedBlocks: 4, totalBlocks: 4, confidence: 'high', guidance: null },
    claims,
  };
  writeFileSync(join(dir, '.vibe-runbook', 'state', 'claims.json'), JSON.stringify(state, null, 2));
  writeFileSync(join(dir, '.vibe-runbook', 'config.json'), JSON.stringify({ pins: { version: 'node version.mjs' } }, null, 2));

  execFileSync('node', [cli, 'walk', '--env', 'stub'], {
    cwd: dir,
    env: { ...process.env, VIBE_RUNBOOK_STUB_TOKEN: 'stub-token' },
  });

  const written = JSON.parse(readFileSync(join(dir, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  const byId = Object.fromEntries(written.claims.map((c) => [c.id, c]));

  expect(byId['c-1'].verdict).toBe('PASS');
  expect(byId['c-1'].evidence).toMatch(/self-answering/i);

  expect(byId['c-2'].verdict).toBe('SPENDS');
  expect(() => readFileSync(join(dir, 'SPENT'), 'utf8')).toThrow(); // the sentinel must never be written

  expect(byId['c-3'].verdict).toBe('PASS');

  expect(byId['c-4'].verdict).toBe('QUESTION');
});

// Fix 2 + Fix 3 (2026-08-14 review): nothing ever read .vibe-runbook/config.json,
// so verifyPin's config.pins fallback was unreachable dead code and every
// status assertion BLOCKED with no url, since nothing ever populates
// claim.url either. This proves both the missing-config case is now
// actionable in the report (not a silent dead end) and that a status
// assertion's url really does resolve from config.urls before verifyStatus
// ever runs -- checked via the persisted claim, independent of whether the
// probe itself can reach the (deliberately unreachable) target.
test('a pin missing both a self-answer and a config entry is an actionable BLOCKED, not silence', () => {
  const { report, claims } = walkDir({
    claims: [
      {
        id: 'c-5', shape: 'pin', venue: 'executable', text: 'Revision `unresolvable`',
        cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
        source: { file: 'runbook.md', line: 1 },
      },
    ],
  });
  expect(claims[0].verdict).toBe('BLOCKED');
  expect(claims[0].evidence).toMatch(/no command/i);
  expect(report).toMatch(/Needs your input to check/);
  expect(report).toContain('config.pins');
});

// Fix 2026-08-14 re-review #3, caught by the network-guard verification run
// itself: this test used to point at a deliberately-unreachable local port
// (127.0.0.1:1) on the theory that a refused connection never really
// "touches the network." It still called the real probe binding
// through the real CLI subprocess, and a global fetch guard confirmed it
// really does call fetch() -- the guard tripped on this exact test before
// the connection was ever refused. Rewritten through runWalk with a stub
// probeUrl that records what url it was called with: proves resolution
// reaches the actual probe call (stronger than the old test, which only
// checked the persisted claim), with no fetch() invocation of any kind.
test("a status assertion's url resolves from config.urls and reaches the probe call", async () => {
  const state = { claims: [statusClaim('c-6', undefined)] };
  const config = { urls: { 'c-6': 'https://stub.invalid/health' } };
  let probedWith = null;
  const walked = await runWalk(state, config, {
    runCommand: () => {},
    probeUrl: async (url) => { probedWith = url; return 401; },
  });
  expect(probedWith).toBe('https://stub.invalid/health');
  // The resolved url is derived config, not claim state (2026-08-14
  // re-review #4) -- it must never be written back onto the persisted
  // claim, or a later correction to config.urls is silently ignored on
  // the next walk. It still reached verifyStatus (proven by probedWith
  // above and by evidence below), it just doesn't get cached here.
  expect(walked[0].url).toBeUndefined();
  expect(walked[0].evidence).toContain('https://stub.invalid/health');
  // Whatever the outcome, it must not be the specific "nothing to check"
  // failure Fix 3 exists to close.
  expect(walked[0].evidence ?? '').not.toMatch(/no url for this status assertion/i);
});

// The regression this shipped without (2026-08-14 re-review #4): resolveUrl
// checked claim.url before config.urls, and runWalk wrote the resolved url
// back onto the returned claim -- so once a url resolved, it was truthy on
// every later walk that didn't re-scan, and a subsequent correction to
// config.urls was silently ignored. Reproduced exactly as the reviewer did:
// run runWalk, change config.urls, feed the first run's own output back in
// as the second run's input -- exactly what the real CLI does through
// claims.json between two `walk` invocations.
test('a corrected config.urls entry is used on the next walk, not the url a previous walk resolved', async () => {
  const claim = statusClaim('c-13', undefined); // no claim.url -- must come from config
  const probedUrls = [];
  const probeUrl = async (url) => { probedUrls.push(url); return 401; };

  const firstWalk = await runWalk(
    { claims: [claim] },
    { urls: { 'c-13': 'https://stub.invalid/old' } },
    { runCommand: () => {}, probeUrl },
  );
  const secondWalk = await runWalk(
    { claims: firstWalk }, // the first walk's own output, as the real CLI feeds claims.json back in
    { urls: { 'c-13': 'https://stub.invalid/new' } }, // corrected between walks
    { runCommand: () => {}, probeUrl },
  );

  expect(probedUrls).toEqual(['https://stub.invalid/old', 'https://stub.invalid/new']);
  expect(secondWalk[0].evidence).toContain('https://stub.invalid/new');
  expect(firstWalk[0].url).toBeUndefined();
  expect(secondWalk[0].url).toBeUndefined();
});

// Fix 1 (2026-08-14 re-review #3): the previous version of this test hit a
// real external host (example.com) to work around this sandbox being unable
// to route loopback between a spawned child process and a server its own
// parent bound (see makeProbe's comment in cli.mjs). That was still a
// network-touching test -- it would fail on a plane, flake behind a
// corporate proxy, and send real traffic on every `npm test`. This tests
// the actual seam instead: `runWalk` takes an injected `probeUrl`, the same
// way verifyPin and verifyStatus already take injected dependencies, so the
// wiring is provable with a stub and no network at all. What can break here
// is cli.mjs's own glue (the probeResults map, the sync lookup closure
// handed to verifyStatus) -- not whether the real internet is up.
function statusClaim(id, url) {
  return {
    id, shape: 'status-assertion', venue: 'executable', text: 'answers 401 unauthenticated', url,
    cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
    source: { file: 'runbook.md', line: 1 },
  };
}

test('a stub probe returning the code the claim expects drives a PASS verdict', async () => {
  const state = { claims: [statusClaim('c-8', 'https://stub.invalid/health')] };
  const walked = await runWalk(state, {}, { runCommand: () => {}, probeUrl: async () => 401 });
  expect(walked[0].verdict).toBe('PASS');
  expect(walked[0].evidence).toContain('401');
});

test('a stub probe returning a different code drives a FAIL verdict', async () => {
  const state = { claims: [statusClaim('c-9', 'https://stub.invalid/health')] };
  const walked = await runWalk(state, {}, { runCommand: () => {}, probeUrl: async () => 422 });
  expect(walked[0].verdict).toBe('FAIL');
  expect(walked[0].evidence).toContain('422');
});

test('a stub probe that throws drives a BLOCKED verdict, not a crash', async () => {
  const state = { claims: [statusClaim('c-10', 'https://stub.invalid/health')] };
  const walked = await runWalk(state, {}, {
    runCommand: () => {},
    probeUrl: async () => { throw new Error('ECONNREFUSED'); },
  });
  expect(walked[0].verdict).toBe('BLOCKED');
  expect(walked[0].evidence).toMatch(/ECONNREFUSED/);
});

// A cost-flagged status assertion must never reach probeUrl at all -- same
// invariant as the pin-side sentinel test above, proven here for the
// status-assertion path specifically since it has its own gate inside
// runWalk (the pre-fetch loop), not only the one in the final .map().
test('runWalk never calls probeUrl for a status assertion that would spend', async () => {
  let calls = 0;
  const claim = { ...statusClaim('c-11', 'https://stub.invalid/health'), cost: { raw: 'spends one check', count: 1 } };
  const walked = await runWalk({ claims: [claim] }, {}, {
    runCommand: () => {},
    probeUrl: async () => { calls += 1; return 401; },
  });
  expect(walked[0].verdict).toBe('SPENDS');
  expect(calls).toBe(0);
});

test('a status assertion with no resolvable url is an actionable BLOCKED', () => {
  const { report, claims } = walkDir({
    claims: [
      {
        id: 'c-7', shape: 'status-assertion', venue: 'executable', text: 'answers 401 unauthenticated',
        cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
        source: { file: 'runbook.md', line: 1 },
      },
    ],
  });
  expect(claims[0].verdict).toBe('BLOCKED');
  expect(claims[0].evidence).toMatch(/no url/i);
  expect(report).toMatch(/Needs your input to check/);
  expect(report).toContain('config.urls');
});

// ---------------------------------------------------------------------------
// Fix 8 (2026-08-14 final review): the credential was a turnstile that opened
// onto an unauthenticated probe. `walk` hard-stopped without
// VIBE_RUNBOOK_<ENV>_TOKEN, checked it was present, discarded it, and then
// probed with no Authorization header at all. A runbook claim like "the
// dashboard returns 200" therefore got 401 back and produced a FAIL against a
// runbook that was telling the truth -- the exact false-FAIL class the walk
// protocol's "contract source beats the guess" rule exists to prevent.
// ---------------------------------------------------------------------------

test('the probe carries the credential as a bearer header', async () => {
  let seen = null;
  const probe = makeProbe('secret-token', async (url, init) => {
    seen = { url, init };
    return { status: 200 };
  });

  await expect(probe('https://stub.invalid/health')).resolves.toBe(200);
  expect(seen.url).toBe('https://stub.invalid/health');
  expect(seen.init.headers.Authorization).toBe('Bearer secret-token');
});

test('no token means no invented header, rather than the string "Bearer undefined"', async () => {
  let seen = null;
  const probe = makeProbe(undefined, async (url, init) => {
    seen = init;
    return { status: 200 };
  });

  await probe('https://stub.invalid/health');
  expect(seen.headers).toEqual({});
  expect(JSON.stringify(seen)).not.toContain('undefined');
});

// Invariant 5 of the guide: never print a secret. The token authenticates the
// probe and must not survive into anything the reader sees, on any verdict.
test('the credential never reaches the persisted claim or the rendered report', async () => {
  const token = 'tok-do-not-print-9f2a';
  const probe = makeProbe(token, async () => ({ status: 404 }));
  const walked = await runWalk(
    { claims: [statusClaim('c-14', 'https://stub.invalid/health')] },
    {},
    { runCommand: () => {}, probeUrl: probe },
  );

  expect(walked[0].verdict).toBe('FAIL');
  expect(JSON.stringify(walked)).not.toContain(token);
  expect(renderReport({ runbook: 'r.md', env: 'live', claims: walked, coverage: {} })).not.toContain(token);
});
