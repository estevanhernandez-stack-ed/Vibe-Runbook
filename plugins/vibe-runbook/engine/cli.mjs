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
import { planRemediation, renderPlan } from './remediate.mjs';
import { backupFile } from './backup.mjs';

// Bound to the project root, not to wherever the engine happens to be running
// from (Fix 5, 2026-08-14 final review). A pin's verification command is
// written from the project's point of view -- `git rev-parse --short HEAD`
// means the project's HEAD -- and running it in the installed plugin directory
// answers a different question with a straight face.
const shellIn = (cwd) => (cmd) => execSync(cmd, { encoding: 'utf8', cwd });

const tokenVar = (env) => `VIBE_RUNBOOK_${env.toUpperCase()}_TOKEN`;
const tokenFor = (env) => process.env[tokenVar(env)];

// Never prints the credential, only whether one is present and what to ask
// for. The token itself is read separately, by the walk, and handed straight
// to the probe -- it must not travel inside a result object that anything
// downstream renders.
const credentialFor = (env) => {
  const token = tokenFor(env);
  return token
    ? { present: true }
    : { present: false, ask: `set ${tokenVar(env)} for environment "${env}"` };
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
// The credential is now carried, not just counted (Fix 8, 2026-08-14 final
// review). preflight hard-stops a walk that has no VIBE_RUNBOOK_<ENV>_TOKEN,
// and this function used to check that same variable was present and then
// probe without it -- a turnstile opening onto an unauthenticated request. A
// runbook claim like "the dashboard returns 200" got 401 back and produced a
// FAIL against a runbook that was telling the truth, which is the same
// false-FAIL class the walk protocol's "contract source beats the guess" rule
// exists to prevent. It is a factory rather than a bare function so the header
// construction is testable with an injected fetch and no network at all; the
// real binding takes `fetch` by default. The token authenticates the request
// and appears nowhere else -- not in evidence, not in the persisted claim, not
// in the report (guide invariant 5).
export function makeProbe(token, fetchImpl = fetch) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return async function probe(url) {
    // A 10s AbortSignal keeps a dead or slow endpoint from hanging a walk.
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
    return res.status;
  };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

// The one root every path in this file hangs off (Fix 5, 2026-08-14 final
// review). Config and state used to be joined off process.cwd(), while the
// family convention runs the engine FROM the plugin directory -- so a walk
// invoked the documented way wrote .vibe-runbook/ into the installed plugin
// and read config from there too. vibe-access solves this with
// `resolve(flags.app ?? process.cwd())`; same move, named for what this plugin
// operates on.
const projectRoot = () => resolvePath(arg('project') ?? process.cwd());

const statePath = (root) => join(root, '.vibe-runbook', 'state', 'claims.json');

// Local house style, not the environment's. Absent config is normal -- most
// runbooks are walked without one, and this is the only place that has to
// know the difference between "no file" and "malformed file" (Fix 2,
// 2026-08-14 review: nothing previously read this file at all, so
// verifyPin's config.pins fallback was unreachable dead code).
function loadConfig(root) {
  const configPath = join(root, '.vibe-runbook', 'config.json');
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
// (shell, makeProbe(token)).
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
  const root = projectRoot();

  if (command === 'scan') {
    const runbook = arg('runbook');
    if (!runbook) { console.error('scan needs --runbook <path>'); process.exit(1); }
    // Relative means relative to the project, not to wherever the engine was
    // launched. Absolute paths pass through untouched.
    const runbookPath = resolvePath(root, runbook);
    const out = scanRunbook(readFileSync(runbookPath, 'utf8'), runbookPath);
    const dest = statePath(root);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`scanned ${out.claims.length} claims, confidence ${out.coverage.confidence}`);
  } else if (command === 'walk') {
    const env = arg('env');
    if (!env) { console.error('walk needs --env <name>; there is no default environment'); process.exit(1); }

    const dest = statePath(root);
    let state;
    try {
      state = JSON.parse(readFileSync(dest, 'utf8'));
    } catch {
      console.error('no cached scan; run `vibe-runbook scan --runbook <path> --project <path>` first');
      process.exit(1);
    }

    const pre = preflight({ env, credentialCheck: () => credentialFor(env) });
    if (!pre.ok) {
      console.error(`BLOCKED: ${pre.blocked}`);
      console.error(`ask: ${pre.ask}`);
      process.exit(1);
    }

    const config = loadConfig(root);
    const walked = await runWalk(state, config, {
      runCommand: shellIn(root),
      probeUrl: makeProbe(tokenFor(env)),
    });

    writeFileSync(dest, `${JSON.stringify({ ...state, env, claims: walked }, null, 2)}\n`, 'utf8');
    console.log(renderReport({ runbook: state.runbook, env, claims: walked, coverage: state.coverage }));
  } else if (command === 'remediate') {
    // The only mutating path in the plugin, and the posture is the point: the
    // default prints diffs and does nothing at all. `--apply` is the whole
    // difference between reading and writing, which is why it has to be typed
    // (Fix 4, 2026-08-14 final review -- this command was advertised in the
    // command surface, in its SKILL, and twice in every walk report, with no
    // entry point anywhere; an agent asked for it would hand-roll the rewrite
    // and bypass the tested, backed-up implementation entirely).
    const apply = process.argv.includes('--apply');

    let state;
    try {
      state = JSON.parse(readFileSync(statePath(root), 'utf8'));
    } catch {
      console.error('no cached scan; run `vibe-runbook scan --runbook <path> --project <path>` first');
      process.exit(1);
    }

    const plan = planRemediation(state.claims ?? [], loadConfig(root));

    if (!apply) {
      console.log(renderPlan(plan, { applied: false }));
    } else {
      // One backup per file, taken before that file's first write, and the
      // write itself is a verbatim match on the claim's own text. A claim
      // whose text does not appear verbatim is reported and skipped: writing a
      // guess into somebody's runbook is the one thing this path must never
      // do. Two causes, and the message names both rather than asserting one.
      // The document may have moved under the cached scan. Or the claim was
      // joined across a line wrap at extraction -- STAR's own HEAD pin is
      // exactly that, "HEAD" ending line 4 and "`0855bd2`" opening line 5
      // under a `> ` prefix -- so the joined text is correct as a claim and
      // has no verbatim span in the file. Rewriting a wrapped claim means
      // rewriting the wrap, which is a v0.2 problem and not one to guess at.
      const backups = new Map();
      const unmatched = [];
      for (const p of plan.proposals) {
        const file = p.source?.file;
        if (!file || !existsSync(file)) { unmatched.push(p); continue; }
        const current = readFileSync(file, 'utf8');
        if (!current.includes(p.before)) { unmatched.push(p); continue; }
        if (!backups.has(file)) backups.set(file, backupFile(file));
        writeFileSync(file, current.replace(p.before, p.after), 'utf8');
      }
      console.log(renderPlan(
        { proposals: plan.proposals.filter((p) => !unmatched.includes(p)), needsContext: plan.needsContext },
        { applied: true, backups: [...backups.values()] },
      ));
      for (const p of unmatched) {
        console.error(
          `skipped ${p.id}: no verbatim match in ${p.source?.file ?? 'any file'}. ` +
          'Either the document moved under the cached scan (re-run :scan), or the claim was ' +
          'joined across a line wrap and has no single-line span to replace. Nothing was written for it.'
        );
      }
    }
  } else {
    console.error(
      'usage: vibe-runbook <scan|walk|remediate> [--runbook <path>] [--env <name>] ' +
      '[--project <path>] [--apply]'
    );
    process.exit(1);
  }
}
