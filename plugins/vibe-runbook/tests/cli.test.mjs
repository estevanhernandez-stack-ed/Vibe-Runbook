import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
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
// credential for the named environment. `stubs`, when given, mimics what
// scan.mjs actually caches on the state object (Fix 5, coordinator round
// 2) -- omitted entirely when not passed, so existing callers see no change
// to the state shape they were already writing.
function walkDir({ claims, config, env = 'stub', stubs }) {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-cli-walk-'));
  mkdirSync(join(dir, '.vibe-runbook', 'state'), { recursive: true });
  const state = {
    schemaVersion: '1.0.0',
    runbook: 'runbook.md',
    coverage: { extracted: claims.length, markedBlocks: claims.length, totalBlocks: claims.length, confidence: 'high', guidance: null },
    claims,
    ...(stubs ? { stubs } : {}),
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

// Found re-running :author after the 2026-08-14 whole-branch review: every
// transport failure came back as the bare string "fetch failed", so a
// BLOCKED claim rendered "could not be verified at generation time: probe
// failed: fetch failed" -- a note that names no reason. Now that the note is
// visible on the page (Fix 3), an uninformative one is a worse defect than
// it was when it lived in an HTML comment.
test('a transport failure names its cause instead of the bare string "fetch failed"', async () => {
  const bare = Object.assign(new Error('fetch failed'), {
    cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }),
  });
  const probe = makeProbe(undefined, async () => { throw bare; });

  await expect(probe('http://127.0.0.1:1/health')).rejects.toThrow(/ECONNREFUSED/);
});

test('an error with no cause is rethrown unchanged, not wrapped in "undefined"', async () => {
  const probe = makeProbe(undefined, async () => { throw new Error('TimeoutError'); });
  await expect(probe('https://stub.invalid/health')).rejects.toThrow(/^TimeoutError$/);
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

// ---------------------------------------------------------------------------
// Fix 5 (2026-08-14 final review): config and state were rooted at
// process.cwd(), but the family convention runs the engine FROM the plugin
// directory -- so a walk launched the documented way wrote .vibe-runbook/ into
// the installed plugin, not the user's project, and read config from there
// too. vibe-access takes `--app`; this takes `--project`, and every config and
// state path joins off it.
// ---------------------------------------------------------------------------

const pluginDir = fileURLToPath(new URL('..', import.meta.url));

test('scan writes state into --project, not into the directory the engine runs from', () => {
  const project = mkdtempSync(join(tmpdir(), 'vrb-proj-'));
  copyFileSync(fixture, join(project, 'runbook.md'));

  execFileSync('node', [cli, 'scan', '--runbook', join(project, 'runbook.md'), '--project', project], {
    cwd: pluginDir,
  });

  const out = JSON.parse(readFileSync(join(project, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  expect(out.claims.length).toBeGreaterThan(0);
  expect(existsSync(join(pluginDir, '.vibe-runbook'))).toBe(false);
});

test('a --runbook path resolves against --project, so a relative path means the project', () => {
  const project = mkdtempSync(join(tmpdir(), 'vrb-proj-rel-'));
  copyFileSync(fixture, join(project, 'runbook.md'));

  execFileSync('node', [cli, 'scan', '--runbook', 'runbook.md', '--project', project], { cwd: pluginDir });

  const out = JSON.parse(readFileSync(join(project, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  expect(out.runbook).toContain('runbook.md');
  expect(out.claims.length).toBeGreaterThan(0);
});

test('walk reads state and config from --project, and writes the walked claims back there', () => {
  const project = mkdtempSync(join(tmpdir(), 'vrb-proj-walk-'));
  mkdirSync(join(project, '.vibe-runbook', 'state'), { recursive: true });
  writeFileSync(join(project, 'version.mjs'), "console.log('9.9.9');\n");
  writeFileSync(
    join(project, '.vibe-runbook', 'state', 'claims.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      runbook: 'runbook.md',
      coverage: { extracted: 1, markedBlocks: 1, totalBlocks: 1, confidence: 'high', guidance: null },
      claims: [{
        id: 'c-1', shape: 'pin', venue: 'executable', text: 'Version `9.9.9`',
        cost: { raw: 'no spend', count: 0 }, verdict: null, evidence: null, checkedAt: null,
        source: { file: 'runbook.md', line: 1 },
      }],
    }, null, 2),
  );
  // The command is relative to the project, which is the only reason resolving
  // config off --project matters rather than being cosmetic.
  writeFileSync(
    join(project, '.vibe-runbook', 'config.json'),
    JSON.stringify({ pins: { version: 'node version.mjs' } }, null, 2),
  );

  const report = execFileSync('node', [cli, 'walk', '--env', 'stub', '--project', project], {
    cwd: pluginDir,
    encoding: 'utf8',
    env: { ...process.env, VIBE_RUNBOOK_STUB_TOKEN: 'stub-token' },
  });

  const written = JSON.parse(readFileSync(join(project, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  expect(written.claims[0].verdict).toBe('PASS');
  expect(report).toContain('9.9.9');
  expect(existsSync(join(pluginDir, '.vibe-runbook'))).toBe(false);
});

// ---------------------------------------------------------------------------
// Coordinator review, round 2 (author.mjs's :author command).
// ---------------------------------------------------------------------------

// Fix 3 (Important): `arg('out')` was passed straight through to
// authorRunbook while every other path in this file resolves against
// --project (scan's --runbook does exactly this a few tests up). Run from a
// cwd that is NOT the project, with a relative --out, so a regression
// reproduces exactly the way the reviewer found it: the file used to land
// beside pluginDir instead of inside the target project.
test('author resolves --out against --project, not the cwd the engine is invoked from', () => {
  const project = mkdtempSync(join(tmpdir(), 'vrb-author-proj-'));
  writeFileSync(join(project, 'README.md'), '# bare\n', 'utf8');

  const out = execFileSync('node', [cli, 'author', '--project', project, '--out', 'docs/RUNBOOK.md'], {
    cwd: pluginDir,
    encoding: 'utf8',
  });

  expect(existsSync(join(project, 'docs', 'RUNBOOK.md'))).toBe(true);
  expect(existsSync(join(pluginDir, 'docs', 'RUNBOOK.md'))).toBe(false);
  expect(out).toContain('wrote');
});

// ---------------------------------------------------------------------------
// Fix 1 + Fix 2 (2026-08-14 whole-branch review), at the wiring level. The
// author branch never called preflight -- the walk branch was its only
// caller -- so the guarantee sold in plugin.json and written down as guide
// invariant 2 ("credential preflight hard-stops rather than quietly walking
// your local machine and calling it green") was true of one of the two
// commands that probe.
// ---------------------------------------------------------------------------

const authorFixture = fileURLToPath(new URL('./fixtures/app-full/', import.meta.url));

// These tests drive the real CLI in a subprocess, so the real probe binding
// (makeProbe -> fetch) is live and there is no seam to inject a stub
// through. The manifest's base urls are therefore rewritten to a loopback
// port nothing listens on: a refused connection, no DNS lookup, no packet
// that leaves the machine, and makeProbe's 10s AbortSignal as the backstop.
// What is under test here is the CLI's own wiring -- preflight, env
// selection, the config write -- and the probe's verdict is incidental to
// every assertion below.
const LOOPBACK = 'http://127.0.0.1:1';

function authorProject() {
  const project = mkdtempSync(join(tmpdir(), 'vrb-author-env-'));
  cpSync(authorFixture, project, { recursive: true });
  const manifestPath = join(project, 'agent-access.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.baseUrls = { prod: LOOPBACK, dev: `${LOOPBACK}0` };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return project;
}

test('author with a named env and no credential hard-stops, and writes nothing', () => {
  const project = authorProject();
  let err;
  try {
    execFileSync('node', [cli, 'author', '--project', project, '--env', 'prod'], {
      cwd: pluginDir, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, VIBE_RUNBOOK_PROD_TOKEN: '' },
    });
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  expect(String(err.stderr)).toMatch(/BLOCKED: credential unavailable for environment "prod"/);
  expect(String(err.stderr)).toMatch(/VIBE_RUNBOOK_PROD_TOKEN/);
  expect(existsSync(join(project, 'docs', 'RUNBOOK.md'))).toBe(false);
});

test('author with no env named writes the document, probes nothing, and says so', () => {
  const project = authorProject();
  const out = execFileSync('node', [cli, 'author', '--project', project], { cwd: pluginDir, encoding: 'utf8' });

  expect(out).toMatch(/no --env named/);
  const doc = readFileSync(join(project, 'docs', 'RUNBOOK.md'), 'utf8');
  expect(doc).not.toMatch(/answers 200/);
  expect(doc).toMatch(/Unwritten:.*alive/);
  expect(existsSync(join(project, '.vibe-runbook', 'config.json'))).toBe(false);
});

// Harm taxonomy (2026-08-17): cost/blast/undo are stub-only sections, so on
// this exact fixture (app-full, no env, no .git in the temp copy) they add
// six to the unwritten count no matter what else was gathered. Was 5
// (header pin, health, incident's three) before these sections existed --
// asserted at the value it is now, since there is no old SECTIONS array
// left to diff against.
test('author prints an unwritten count that includes the three new harm sections', () => {
  const project = authorProject();
  const out = execFileSync('node', [cli, 'author', '--project', project], { cwd: pluginDir, encoding: 'utf8' });

  expect(out).toMatch(/11 sections are unwritten and need you\./);
  const doc = readFileSync(join(project, 'docs', 'RUNBOOK.md'), 'utf8');
  expect(doc).toMatch(/\*\*Unwritten:\*\* What does each operation/);
  expect(doc).toMatch(/\*\*Unwritten:\*\* What state does a deploy/);
  expect(doc).toMatch(/\*\*Unwritten:\*\* What here cannot be undone/);
});

// The composition the plugin sells, end to end and with no network: author
// writes it, scan reads it back, walk checks the SAME url the generator
// checked. Before Fix 2 this ended in
// "BLOCKED - no url for this status assertion" on every generated document,
// forever, and the report asked the user to supply a url the generator had
// in hand at write time.
test('author -> scan -> walk checks the url the generator checked, instead of BLOCKING on it', async () => {
  const project = authorProject();
  execFileSync('node', [cli, 'author', '--project', project, '--env', 'prod'], {
    cwd: pluginDir, encoding: 'utf8',
    env: { ...process.env, VIBE_RUNBOOK_PROD_TOKEN: 'stub-token' },
  });
  execFileSync('node', [cli, 'scan', '--runbook', 'docs/RUNBOOK.md', '--project', project], { cwd: pluginDir });

  const state = JSON.parse(readFileSync(join(project, '.vibe-runbook', 'state', 'claims.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(project, '.vibe-runbook', 'config.json'), 'utf8'));

  const probed = [];
  const walked = await runWalk(state, config, {
    runCommand: () => 'abc1234',
    probeUrl: async (url) => { probed.push(url); return 200; },
  });

  expect(probed).toEqual([`${LOOPBACK}/api/health`]);
  const status = walked.find((c) => c.shape === 'status-assertion');
  expect(status.verdict).toBe('PASS');
  expect(status.evidence ?? '').not.toMatch(/no url for this status assertion/i);
});

// The author path probes over the real network binding, so it needs the same
// never-print-a-secret discipline the walk has. The token authenticates the
// request and reaches neither the document nor the config written beside it.
test('the author credential never reaches the generated document or its config', () => {
  const project = authorProject();
  const token = 'tok-author-do-not-print-4c1e';
  const out = execFileSync('node', [cli, 'author', '--project', project, '--env', 'prod'], {
    cwd: pluginDir, encoding: 'utf8',
    env: { ...process.env, VIBE_RUNBOOK_PROD_TOKEN: token },
  });

  expect(out).not.toContain(token);
  expect(readFileSync(join(project, 'docs', 'RUNBOOK.md'), 'utf8')).not.toContain(token);
  expect(readFileSync(join(project, '.vibe-runbook', 'config.json'), 'utf8')).not.toContain(token);
});

// Fix 5 (Important): scan.mjs caches `stubs` on every scan, and renderReport
// already knows how to print "N sections unwritten" -- but the `walk`
// branch never forwarded state.stubs into the renderReport call, so the
// param silently defaulted to [] and the line never reached real walk
// output no matter how incomplete the runbook actually was.
test('walk forwards cached stubs into the report, so "N sections unwritten" reaches real output', () => {
  const { report } = walkDir({
    claims: [],
    stubs: [
      { question: 'Who gets paged when this degrades?', line: 12 },
      { question: 'What does degraded-but-acceptable look like here?', line: 16 },
    ],
  });
  expect(report).toMatch(/2 sections unwritten/);
  expect(report).toContain('Who gets paged when this degrades?');
});

// ---------------------------------------------------------------------------
// Fix 4 (2026-08-14 final review): the command surface, the SKILL and every
// walk report all named /vibe-runbook:remediate, and cli.mjs dispatched `scan`
// and `walk` only. This is the plugin's one mutating path, so the guard on it
// -- diffs by default, writes only on an explicit flag -- is the behavior
// under test, not a detail of it.
// ---------------------------------------------------------------------------

function remediateDir() {
  const project = mkdtempSync(join(tmpdir(), 'vrb-rem-'));
  const runbook = join(project, 'runbook.md');
  writeFileSync(runbook, '# Ops\n\n> **Revision `star-00049-j5r`** is what is deployed.\n');
  mkdirSync(join(project, '.vibe-runbook', 'state'), { recursive: true });
  writeFileSync(
    join(project, '.vibe-runbook', 'state', 'claims.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      runbook,
      coverage: { extracted: 1, markedBlocks: 1, totalBlocks: 3, confidence: 'high', guidance: null },
      claims: [{
        id: 'c-001', shape: 'pin', venue: 'executable', text: '**Revision `star-00049-j5r`**',
        cost: { raw: null, count: null }, verdict: 'FAIL',
        evidence: 'runbook says star-00049-j5r, system says star-00099-NEW',
        checkedAt: null, source: { file: runbook, line: 3 },
      }],
    }, null, 2),
  );
  writeFileSync(
    join(project, '.vibe-runbook', 'config.json'),
    JSON.stringify({ pins: { revision: 'gcloud run services describe star' } }, null, 2),
  );
  return { project, runbook };
}

const runRemediate = (project, extra = []) =>
  execFileSync('node', [cli, 'remediate', '--project', project, ...extra], {
    cwd: pluginDir, encoding: 'utf8',
  });

test('remediate prints the diff and changes nothing', () => {
  const { project, runbook } = remediateDir();
  const before = readFileSync(runbook, 'utf8');

  const out = runRemediate(project);

  expect(out).toContain('value-to-command');
  expect(out).toContain('gcloud run services describe star');
  expect(out).toMatch(/nothing was written/i);
  expect(readFileSync(runbook, 'utf8')).toBe(before);
});

test('remediate --apply writes the rewrite, and backs the file up first', () => {
  const { project, runbook } = remediateDir();
  const before = readFileSync(runbook, 'utf8');

  const out = runRemediate(project, ['--apply']);

  const after = readFileSync(runbook, 'utf8');
  expect(after).toContain('Revision — run: `gcloud run services describe star`');
  expect(after).not.toContain('star-00049-j5r');
  expect(out).toMatch(/backed up/i);

  const backup = readdirSync(project).find((f) => f.includes('.vibe-runbook-') && f.endsWith('.bak'));
  expect(backup).toBeDefined();
  expect(readFileSync(join(project, backup), 'utf8')).toBe(before);
});

test('remediate without a cached scan says which command to run first, and exits nonzero', () => {
  const project = mkdtempSync(join(tmpdir(), 'vrb-rem-bare-'));
  let err;
  try {
    runRemediate(project);
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  expect(String(err.stderr)).toMatch(/scan/);
});

test('remediate reports a pin it cannot rewrite instead of inventing a command', () => {
  const { project } = remediateDir();
  writeFileSync(join(project, '.vibe-runbook', 'config.json'), JSON.stringify({}, null, 2));

  const out = runRemediate(project);

  expect(out).toMatch(/Cannot rewrite without you/);
  expect(out).toContain('config.pins.revision');
  expect(out).not.toContain('gcloud');
});

// Found live, running --apply against the real STAR fixture after wiring Fix 4:
// extraction joins a claim across a line wrap, so a pin like STAR's HEAD --
// "HEAD" ending one line, "`0855bd2`" opening the next under a `> ` prefix --
// is a correct claim with no verbatim single-line span in the file. Rewriting
// it means rewriting the wrap, which is not a thing to guess at inside
// somebody's runbook. It must be skipped, named, and leave the file untouched.
// Found live by a reviewer on a real runbook: `current.replace(p.before,
// p.after)` passes `p.after` as a *replacement pattern*, not a literal string
// -- `String.prototype.replace` special-cases `$'`, `` $` ``, `$&`, and `$$`
// inside it. `p.after` is built from user-supplied config
// (config.pins.<label>), and any ordinary bash ANSI-C-quoted command --
// `echo $'9.9.9'`, `awk -F$'\t'` -- carries `$'` right through. The reviewer's
// repro: config.pins.version = "echo $'9.9.9'" printed a correct diff and then
// spliced the rest of the document into the middle of the file on write (136
// bytes in, 231 bytes out). `$$` collapses silently to a single `$` instead of
// splicing -- the sneakier of the two, since nothing looks obviously wrong.
// `$&` re-injects the matched claim text. The fix wraps `p.after` in a
// replacer function (`() => p.after`), which turns off pattern interpretation
// entirely. Asserted on the file on disk after the real --apply subprocess
// runs, not on the proposal object -- the proposal was always correct, and
// asserting on it is exactly what let this through.
function remediateDirWithCommand(command) {
  const project = mkdtempSync(join(tmpdir(), 'vrb-dollar-'));
  const runbook = join(project, 'runbook.md');
  const original =
    '# Ops\n\n> **Revision `star-00049-j5r`** is what is deployed.\n\n' +
    '## Notes\n\nEverything below this line must land in the same place, byte for byte, after --apply runs.\n';
  writeFileSync(runbook, original);
  mkdirSync(join(project, '.vibe-runbook', 'state'), { recursive: true });
  writeFileSync(
    join(project, '.vibe-runbook', 'state', 'claims.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      runbook,
      coverage: { extracted: 1, markedBlocks: 1, totalBlocks: 3, confidence: 'high', guidance: null },
      claims: [{
        id: 'c-001', shape: 'pin', venue: 'executable', text: '**Revision `star-00049-j5r`**',
        cost: { raw: null, count: null }, verdict: 'FAIL',
        evidence: 'runbook says star-00049-j5r, system says star-00099-NEW',
        checkedAt: null, source: { file: runbook, line: 3 },
      }],
    }, null, 2),
  );
  writeFileSync(
    join(project, '.vibe-runbook', 'config.json'),
    JSON.stringify({ pins: { revision: command } }, null, 2),
  );
  return { project, runbook, original };
}

// The expected file is computed with the replacer-function form -- the same
// mechanism the fix uses -- rather than hand-written, since the corruption
// depends on the exact trailing bytes of `original`. That form is what's
// under test in cli.mjs; used here only to state "no pattern interpretation"
// as the expectation, not to duplicate the fix's logic under test.
const literalReplace = (haystack, before, after) => haystack.replace(before, () => after);

test('remediate --apply writes a config command containing $\' byte-exact, not spliced by String.replace substitution syntax', () => {
  const command = "echo $'9.9.9'";
  const { project, runbook, original } = remediateDirWithCommand(command);

  runRemediate(project, ['--apply']);

  const expected = literalReplace(original, '**Revision `star-00049-j5r`**', `Revision — run: \`${command}\``);
  expect(readFileSync(runbook, 'utf8')).toBe(expected);
});

test('remediate --apply writes a config command containing $$ byte-exact, not silently collapsed to a single $', () => {
  const command = 'echo "pid: $$"';
  const { project, runbook, original } = remediateDirWithCommand(command);

  runRemediate(project, ['--apply']);

  const expected = literalReplace(original, '**Revision `star-00049-j5r`**', `Revision — run: \`${command}\``);
  expect(readFileSync(runbook, 'utf8')).toBe(expected);
});

test('remediate --apply writes a config command containing $& byte-exact, not replaced with the matched claim text', () => {
  const command = 'echo "match was: $&"';
  const { project, runbook, original } = remediateDirWithCommand(command);

  runRemediate(project, ['--apply']);

  const expected = literalReplace(original, '**Revision `star-00049-j5r`**', `Revision — run: \`${command}\``);
  expect(readFileSync(runbook, 'utf8')).toBe(expected);
});

test('a claim joined across a line wrap is skipped and named, never guessed into the file', () => {
  const project = mkdtempSync(join(tmpdir(), 'vrb-wrap-'));
  const runbook = join(project, 'runbook.md');
  const original = '# Ops\n\n> what is deployed, HEAD\n> `0855bd2`, and nothing else.\n';
  writeFileSync(runbook, original);
  mkdirSync(join(project, '.vibe-runbook', 'state'), { recursive: true });
  writeFileSync(
    join(project, '.vibe-runbook', 'state', 'claims.json'),
    JSON.stringify({
      schemaVersion: '1.0.0', runbook,
      coverage: { extracted: 1, markedBlocks: 1, totalBlocks: 4, confidence: 'high', guidance: null },
      claims: [{
        id: 'c-002', shape: 'pin', venue: 'executable', text: 'HEAD `0855bd2`',
        cost: { raw: null, count: null }, verdict: 'FAIL',
        evidence: 'runbook says 0855bd2, system says a81ac10',
        checkedAt: null, source: { file: runbook, line: 3 },
      }],
    }, null, 2),
  );
  writeFileSync(
    join(project, '.vibe-runbook', 'config.json'),
    JSON.stringify({ pins: { head: 'git rev-parse --short HEAD' } }, null, 2),
  );

  const proc = execFileSync('node', [cli, 'remediate', '--project', project, '--apply'], {
    cwd: pluginDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });

  expect(readFileSync(runbook, 'utf8')).toBe(original);
  expect(readdirSync(project).some((f) => f.endsWith('.bak'))).toBe(false);
  expect(proc).not.toContain('git rev-parse');
});
