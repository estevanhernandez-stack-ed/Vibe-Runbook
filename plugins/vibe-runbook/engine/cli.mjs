#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRunbook } from './scan.mjs';
import { preflight } from './preflight.mjs';
import { verifyPin, verifyStatus } from './verify.mjs';
import { assignVerdict } from './verdict.mjs';
import { renderReport } from './report.mjs';

const shell = (cmd) => execSync(cmd, { encoding: 'utf8' });

// Never prints the credential, only whether one is present and what to ask for.
const credentialFor = (env) => {
  const token = process.env[`VIBE_RUNBOOK_${env.toUpperCase()}_TOKEN`];
  return token
    ? { present: true }
    : { present: false, ask: `set VIBE_RUNBOOK_${env.toUpperCase()}_TOKEN for environment "${env}"` };
};

// Node's own fetch, not a shell-out (Fix 1, 2026-08-14 re-review #2). The
// earlier binding shelled to `curl -s -o /dev/null -w "%{http_code}" <url>`,
// which was broken on Windows two ways, both confirmed directly rather than
// assumed: against an unreachable target it exited nonzero regardless of
// reachability, because /dev/null is not a real path under cmd.exe (curl
// error 23, write error); against a REAL reachable local server it hung
// outright under execSync -- timed out rather than erroring -- which is
// worse than a wrong verdict. fetch removes the shell, the null-sink
// assumption, and the platform difference in one move. A 10s AbortSignal
// keeps a dead or slow endpoint from ever hanging a walk the way the old
// binding just did.
//
// This function itself is intentionally thin and is NOT covered by the
// suite (2026-08-14 re-review #3): exercising it for real needs either a
// live network call or a loopback socket, and this dev sandbox cannot even
// route loopback between a spawned child process and a server its own
// parent bound (confirmed directly while building the previous round's
// fix). What the tests cover instead is runWalk below, via an injected
// `probeUrl` stub -- the actual wiring that can break.
async function fetchStatus(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  return res.status;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

// Local house style, not the environment's. Absent config is normal -- most
// runbooks are walked without one, and this is the only place that has to
// know the difference between "no file" and "malformed file" (Fix 2,
// 2026-08-14 review: nothing previously read this file at all, so
// verifyPin's config.pins fallback was unreachable dead code).
function loadConfig() {
  const configPath = join(process.cwd(), '.vibe-runbook', 'config.json');
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

// Pins key their config entry by label (verify.mjs's resolveCommand does the
// same split on the claim text). A status assertion is usually a full
// sentence with no such label -- "Every new route answers 401" has nothing
// to split on -- so this keys by claim id instead, which is stable across a
// scan-then-walk because ids are assigned once, at scan time (Fix 3,
// 2026-08-14 review).
function resolveUrl(claim, config) {
  if (claim.url) return claim.url;
  return config.urls?.[claim.id] ?? null;
}

// The walk orchestration, parameterized by every side-effecting dependency
// -- a command runner and a url prober -- exactly the way verifyPin and
// verifyStatus already take theirs. This is the seam the suite actually
// tests (2026-08-14 re-review #3): inject a stub `probeUrl`, assert that
// what it returns drives the verdict, no network and no shell involved. The
// CLI entry point below is the only caller that passes the real bindings
// (shell, fetchStatus).
export async function runWalk(state, config, { runCommand, probeUrl }) {
  // verifyStatus calls its httpProbe argument synchronously and expects a
  // return value back, not a Promise -- that contract in verify.mjs does
  // not change. probeUrl is inherently async (fetch, or a stub standing in
  // for it), so every reachable url is probed up front, here, before the
  // synchronous pass below. The function actually handed to verifyStatus
  // is a plain synchronous lookup into what was already probed -- a
  // cost-flagged or unresolvable url is never in this map, so it is never
  // probed either.
  const probeResults = new Map();
  for (const c of state.claims) {
    if (c.shape !== 'status-assertion') continue;
    if ((c.cost?.count ?? 0) > 0) continue; // never probes a claim that spends
    const url = resolveUrl(c, config);
    if (!url || probeResults.has(url)) continue;
    try {
      probeResults.set(url, { status: await probeUrl(url) });
    } catch (e) {
      probeResults.set(url, { error: e });
    }
  }
  const probe = (url) => {
    const r = probeResults.get(url);
    if (r?.error) throw r.error;
    return r?.status;
  };

  return state.claims.map((c) => {
    // Gate BEFORE the call, not after. `assignVerdict(c, verifyPin(...))`
    // evaluates `verifyPin(...)` as a normal JS argument before
    // `assignVerdict` is ever entered, so assignVerdict's own cost check
    // (verdict.mjs) always ran too late to stop the spend it exists to
    // stop (Fix 1, 2026-08-14 review, caught live with a sentinel file). A
    // cost-flagged claim must never reach a verifier at all.
    if ((c.cost?.count ?? 0) > 0) return assignVerdict(c, null);
    if (c.shape === 'pin') return assignVerdict(c, verifyPin(c, { runCommand, config }));
    if (c.shape === 'status-assertion') {
      // The resolved url is derived from config for THIS walk only -- it
      // is never written back onto the persisted claim (2026-08-14
      // re-review #4). Doing so used to mean a corrected config.urls entry
      // was silently ignored on the next walk, because claim.url would
      // already be truthy from the previous run and resolveUrl prefers it.
      // claims.json should carry what scan found plus the last walk's
      // verdicts, not a cached copy of configuration that can change
      // underneath it. verifyStatus still needs the url to probe and to
      // name in its evidence, so it goes into the object built just for
      // that call; assignVerdict gets the original, unmodified claim.
      const url = resolveUrl(c, config);
      const checkResult = verifyStatus({ ...c, url }, { httpProbe: probe });
      return assignVerdict(c, checkResult);
    }
    return assignVerdict(c, null);
  });
}

// Guards the CLI dispatch below so importing this file (as tests import
// runWalk) never runs it -- only executing it directly, as the entry
// point, does. Paths are resolved through path.resolve rather than
// compared as raw strings because process.argv[1] and import.meta.url
// disagree on separators and URL-encoding on Windows.
const isMain =
  process.argv[1] && resolvePath(process.argv[1]) === resolvePath(fileURLToPath(import.meta.url));

if (isMain) {
  const command = process.argv[2];

  if (command === 'scan') {
    const runbook = arg('runbook');
    if (!runbook) { console.error('scan needs --runbook <path>'); process.exit(1); }
    const out = scanRunbook(readFileSync(runbook, 'utf8'), runbook);
    const dest = join(process.cwd(), '.vibe-runbook', 'state', 'claims.json');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`scanned ${out.claims.length} claims, confidence ${out.coverage.confidence}`);
  } else if (command === 'walk') {
    const env = arg('env');
    if (!env) { console.error('walk needs --env <name>; there is no default environment'); process.exit(1); }

    const statePath = join(process.cwd(), '.vibe-runbook', 'state', 'claims.json');
    let state;
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      console.error('no cached scan; run `vibe-runbook scan --runbook <path>` first');
      process.exit(1);
    }

    const pre = preflight({ env, credentialCheck: () => credentialFor(env) });
    if (!pre.ok) {
      console.error(`BLOCKED: ${pre.blocked}`);
      console.error(`ask: ${pre.ask}`);
      process.exit(1);
    }

    const config = loadConfig();
    const walked = await runWalk(state, config, { runCommand: shell, probeUrl: fetchStatus });

    writeFileSync(statePath, `${JSON.stringify({ ...state, env, claims: walked }, null, 2)}\n`, 'utf8');
    console.log(renderReport({ runbook: state.runbook, env, claims: walked, coverage: state.coverage }));
  } else {
    console.error('usage: vibe-runbook <scan|walk> [--runbook <path>] [--env <name>]');
    process.exit(1);
  }
}
