import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    timeout: 20_000, // defense in depth: fetchStatus's own 10s AbortSignal should always win first
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

test("a status assertion's url resolves from config.urls before verifyStatus runs", () => {
  const { claims } = walkDir({
    claims: [
      {
        id: 'c-6', shape: 'status-assertion', venue: 'executable', text: 'answers 200 ok',
        cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
        source: { file: 'runbook.md', line: 1 },
      },
    ],
    config: { urls: { 'c-6': 'http://127.0.0.1:1/unreachable' } },
  });
  // The url made it onto the claim -- resolution happened -- regardless of
  // whether the probe against a deliberately-unreachable port can complete.
  expect(claims[0].url).toBe('http://127.0.0.1:1/unreachable');
  expect(claims[0].verdict).not.toBe(null);
  // Whatever the outcome, it must not be the specific "nothing to check"
  // failure Fix 3 exists to close.
  expect(claims[0].evidence ?? '').not.toMatch(/no url for this status assertion/i);
});

// Fix 1 (2026-08-14 re-review #2): the previous probe() shelled to
// `curl -s -o /dev/null ...`, which was broken on Windows two ways --
// nonzero exit against an unreachable target regardless of reachability,
// and an outright hang against a REAL reachable one (both confirmed
// directly with a throwaway script, not assumed). The natural test here
// would spin up a local server and point `walk` at it, but this dev
// sandbox itself cannot route 127.0.0.1 between a spawned child process
// and the server its parent bound -- confirmed directly too: identical
// hang for both curl and fetch against a same-machine sibling-process
// server, sandbox flag on or off, while a spawned child reaching a real
// external host works fine every time. So these two use a real, stable
// external target (example.com, IANA's reserved documentation domain --
// not going anywhere, not rate-limited) to prove fetch genuinely completes
// a round trip and reports the true status, which is what this fix is
// actually about: PASS wasn't previously reachable on Windows at all.
test('walk probes a status assertion with fetch and PASSes on a real match, no shell involved', () => {
  const { claims } = walkDir({
    claims: [
      {
        id: 'c-8', shape: 'status-assertion', venue: 'executable', text: 'answers 200 ok',
        cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
        source: { file: 'runbook.md', line: 1 },
      },
    ],
    config: { urls: { 'c-8': 'https://example.com/' } },
  });
  expect(claims[0].verdict).toBe('PASS');
  expect(claims[0].evidence).toContain('200');
});

// A status assertion that disagrees with the live system is a FAIL, not a
// BLOCKED -- fetch has to surface the real mismatched code, not just "it
// connected."
test('walk probes a status assertion with fetch and FAILs on a real mismatch', () => {
  const { claims } = walkDir({
    claims: [
      {
        id: 'c-9', shape: 'status-assertion', venue: 'executable', text: 'answers 200 ok',
        cost: { raw: null, count: null }, verdict: null, evidence: null, checkedAt: null,
        source: { file: 'runbook.md', line: 1 },
      },
    ],
    config: { urls: { 'c-9': 'https://example.com/definitely-not-a-real-path-xyz123' } },
  });
  expect(claims[0].verdict).toBe('FAIL');
  expect(claims[0].evidence).toContain('404');
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
