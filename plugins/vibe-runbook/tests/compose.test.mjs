import { compose, SECTIONS } from '../engine/compose.mjs';
import { expectedCode } from '../engine/verify.mjs';

const facts = [
  { kind: 'head-command', key: 'HEAD', value: 'git rev-parse --short HEAD', source: 'git' },
  { kind: 'run-command', key: 'start', value: 'npm run start', source: 'package.json' },
  { kind: 'env-key', key: 'API_KEY', value: '', source: '.env.example' },
  { kind: 'deploy-command', key: 'deploy.sh', value: './scripts/deploy.sh', source: './scripts/deploy.sh' },
  { kind: 'health-path', key: 'health', value: '/api/health', source: 'agent-access.json' },
  { kind: 'base-url', key: 'prod', value: 'https://demo.example.com', source: 'agent-access.json' },
];

// `prod` is the key the base-url fact above carries, and naming an
// environment is now what permits a health draft to exist at all -- see the
// env-gating block at the bottom of this file.
const prod = { env: 'prod' };

test('sections come back in a fixed order', () => {
  const out = compose({ facts, gaps: [] }, prod);
  expect(out.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
});

test('a pin drafts as a COMMAND, never as a value', () => {
  const out = compose({ facts, gaps: [] }, prod);
  const header = out.find((s) => s.id === 'header');
  const pin = header.drafts.find((d) => /HEAD/i.test(d.text));
  expect(pin.text).toContain('run: `git rev-parse --short HEAD`');
  // No `command` field: it was read by nothing, and author.mjs deliberately
  // ignored it because forwarding it broke verifyPin's self-answering path.
  expect(pin.verify).toEqual({ type: 'pin' });
});

test('a health path plus a base url drafts a checkable status assertion', () => {
  const out = compose({ facts, gaps: [] }, prod);
  const health = out.find((s) => s.id === 'health');
  const d = health.drafts[0];
  expect(d.verify.type).toBe('status');
  expect(d.verify.url).toBe('https://demo.example.com/api/health');
});

test('deploy is recorded and explicitly NOT verifiable by running it', () => {
  const out = compose({ facts, gaps: [] }, prod);
  const deploy = out.find((s) => s.id === 'deploy');
  expect(deploy.drafts[0].text).toContain('./scripts/deploy.sh');
  expect(deploy.drafts[0].verify.type).toBe('none');
});

test('env keys are drafted by NAME with no value anywhere', () => {
  const out = compose({ facts, gaps: [] }, prod);
  const run = out.find((s) => s.id === 'run');
  expect(JSON.stringify(run)).toContain('API_KEY');
  expect(JSON.stringify(run)).not.toMatch(/=\s*\S/);
});

test('a log command fills the observability section instead of stubbing it', () => {
  const out = compose(
    { facts: [{ kind: 'log-command', key: 'logs', value: 'npm run logs', source: 'package.json' }], gaps: [] },
    prod,
  );
  const obs = out.find((s) => s.id === 'observability');
  expect(obs.drafts[0].text).toContain('npm run logs');
  expect(obs.stubs).toHaveLength(0);
});

test('a section with no facts becomes a stub carrying its own question', () => {
  const out = compose({ facts: [], gaps: ['no scripts/ directory'] });
  const incident = out.find((s) => s.id === 'incident');
  expect(incident.stubs.length).toBeGreaterThan(0);
  expect(incident.stubs[0]).toMatch(/\?$/);
});

// Fix 1 (review, 2026-08-14): the original STUB_QUESTIONS only covered
// incident/observability/rollback. header, run, health and deploy could come
// back with zero drafts, zero stubs, zero notes -- completely silent, which
// is exactly the failure this plugin exists to refuse. Asserting over every
// SECTIONS id (not just incident) is what would have caught the asymmetry,
// and it keeps catching it if a section is added later.
test('every section yields a stub when composed with no facts at all', () => {
  const out = compose({ facts: [], gaps: [] });
  for (const s of SECTIONS) {
    const section = out.find((o) => o.id === s.id);
    expect(section.stubs.length).toBeGreaterThan(0);
    expect(section.stubs[0]).toMatch(/\?$/);
  }
});

// Fix 2 (review): git.mjs legitimately emits a base-url fact for any
// https-shaped remote, so a GitHub-hosted repo's own remote URL was
// eligible to win the "first https base-url" race and become the health
// target. A repo URL is never a service base -- excluded regardless of
// array order, so the manifest-sourced base always wins.
test('a git remote never becomes the health-check base url, in either fact order', () => {
  const manifestBase = { kind: 'base-url', key: 'prod', value: 'https://demo.example.com', source: 'agent-access.json' };
  const gitRemote = { kind: 'base-url', key: 'remote', value: 'https://github.com/org/repo.git', source: 'git' };
  const healthPath = { kind: 'health-path', key: 'health', value: '/api/health', source: 'agent-access.json' };

  for (const facts of [[gitRemote, manifestBase, healthPath], [manifestBase, gitRemote, healthPath]]) {
    const out = compose({ facts, gaps: [] }, prod);
    const health = out.find((s) => s.id === 'health');
    expect(health.drafts[0].verify.url).toBe('https://demo.example.com/api/health');
  }
});

// Fix 4 (review): a relative health-path with no base url to join against
// produces a non-checkable "verify.type: status" -- worse than not drafting
// at all, since it reads as verified when it is not answerable. Drop the
// draft; the section-level stub (Fix 1) picks it up instead.
test('a health path with no base url drafts no status assertion, only the stub', () => {
  const facts = [{ kind: 'health-path', key: 'health', value: '/api/health', source: 'agent-access.json' }];
  const out = compose({ facts, gaps: [] }, prod);
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
});

// Fix 4 (review): an absolute health-path must be used as-is, not
// concatenated onto a base url, or the result is a doubled, non-existent
// URL. It has to belong to the named environment to be drafted at all
// (Fix A below), so the origin here matches on purpose.
test('an absolute health path is used as-is, never concatenated onto a base url', () => {
  const facts = [
    { kind: 'base-url', key: 'prod', value: 'https://demo.example.com', source: 'agent-access.json' },
    { kind: 'health-path', key: 'health', value: 'https://demo.example.com/healthz', source: 'agent-access.json' },
  ];
  const out = compose({ facts, gaps: [] }, prod);
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts[0].verify.url).toBe('https://demo.example.com/healthz');
});

// ---------------------------------------------------------------------------
// Fix A (CRITICAL, 2026-08-14 re-review). --env gated WHETHER a probe
// happened, not WHERE it went: an absolute health-path skipped the base-url
// join entirely, so `--env prod` against a manifest whose affordance path is
// a full localhost url sent a production bearer token to 127.0.0.1 over
// plain HTTP. The original C1 outcome, through the branch the first fix did
// not cover. The suite already had the no-env half of this case; only that
// half was closed.
// ---------------------------------------------------------------------------

const absoluteLocalPath = (base) => [
  { kind: 'base-url', key: 'prod', value: base, source: 'agent-access.json' },
  { kind: 'health-path', key: 'health', value: 'http://127.0.0.1:8792/api/health', source: 'agent-access.json' },
];

test('an absolute health path on a DIFFERENT origin than the named env is not drafted', () => {
  const out = compose({ facts: absoluteLocalPath('https://demo.example.com'), gaps: [] }, prod);
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
});

test('an absolute health path matching the named env origin is drafted', () => {
  const out = compose({ facts: absoluteLocalPath('http://127.0.0.1:8792'), gaps: [] }, prod);
  expect(out.find((s) => s.id === 'health').drafts[0].verify.url).toBe('http://127.0.0.1:8792/api/health');
});

// Found live while re-verifying Fix A, and it is a false FAIL the generator
// wrote into its OWN document: an absolute path put its host in the claim
// text, and verify.mjs's expectedCode takes the first 1xx-5xx-shaped number
// it sees -- `127` out of `127.0.0.1`, never reaching the 200 the sentence
// asserts. The birth check then rendered "did not hold: ... -> 200, runbook
// says 127" under a claim that was correct. The text names the path; the
// host lives in verify.url and in the config entry the walk resolves.
test('an absolute health path names the PATH in its claim text, never the host', () => {
  const draft = compose({ facts: absoluteLocalPath('http://127.0.0.1:8792'), gaps: [] }, prod)
    .find((s) => s.id === 'health').drafts[0];
  expect(draft.text).toBe('**Right:** `/api/health` answers 200.');
  expect(draft.text).not.toContain('127.0.0.1');
  expect(expectedCode(draft.text)).toBe(200);
});

// A trailing slash and an explicit default port are the same host, and
// treating either as a mismatch would stub a claim that is genuinely
// checkable. Origin comparison, not string comparison.
test('origin matching is not a string compare: trailing slash and default port still match', () => {
  const slash = compose(
    {
      facts: [
        { kind: 'base-url', key: 'prod', value: 'https://demo.example.com/', source: 'agent-access.json' },
        { kind: 'health-path', key: 'health', value: 'https://demo.example.com/healthz', source: 'agent-access.json' },
      ],
      gaps: [],
    },
    prod,
  );
  expect(slash.find((s) => s.id === 'health').drafts).toHaveLength(1);

  const port = compose(
    {
      facts: [
        { kind: 'base-url', key: 'prod', value: 'https://demo.example.com:443', source: 'agent-access.json' },
        { kind: 'health-path', key: 'health', value: 'https://demo.example.com/healthz', source: 'agent-access.json' },
      ],
      gaps: [],
    },
    prod,
  );
  expect(port.find((s) => s.id === 'health').drafts).toHaveLength(1);
});

// A named env whose base url is absent has no origin to prove membership
// against, so an absolute path cannot be shown to belong to it.
test('an absolute health path with no base url for the named env is not drafted', () => {
  const facts = [{ kind: 'health-path', key: 'health', value: 'http://127.0.0.1:8792/api/health', source: 'agent-access.json' }];
  const out = compose({ facts, gaps: [] }, { env: 'prod' });
  expect(out.find((s) => s.id === 'health').drafts).toHaveLength(0);
});

// Fix 3 (review): gaps landed under "What you are looking at" (header),
// indistinguishable from header commentary. They now get their own titled
// place at the end of the composed output instead.
test('gaps get their own titled place at the end, not the header section', () => {
  const out = compose({ facts: [], gaps: ['no Dockerfile, so the container port was not derived'] });

  const header = out.find((s) => s.id === 'header');
  expect(header.notes.some((n) => /no Dockerfile/.test(n))).toBe(false);

  const last = out[out.length - 1];
  expect(last.title).toMatch(/could not be gathered/i);
  expect(last.notes.some((n) => /no Dockerfile/.test(n))).toBe(true);
});

test('no gaps means no trailing gaps section at all', () => {
  const out = compose({ facts, gaps: [] }, prod);
  expect(out.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
});

// ---------------------------------------------------------------------------
// Fix 1 (CRITICAL, 2026-08-14 whole-branch review). The base url used to be
// "the first non-git https base-url in fact order", which is file order out
// of a manifest. Two consequences, both reproduced live: `:author` with no
// --env probed prod unauthenticated and wrote the 200 down as a PASS, and
// `--env prod` against a manifest listing `local` first sent a production
// bearer token to http://127.0.0.1 over plain HTTP.
// ---------------------------------------------------------------------------

const twoEnvFacts = [
  // Deliberately listed local-first: the ordering that produced the leak.
  { kind: 'base-url', key: 'local', value: 'http://127.0.0.1:8792', source: 'agent-access.json' },
  { kind: 'base-url', key: 'prod', value: 'https://demo.example.com', source: 'agent-access.json' },
  { kind: 'health-path', key: 'health', value: '/health', source: 'agent-access.json' },
];

test('no env named means no status draft at all, only the health stub', () => {
  const out = compose({ facts: twoEnvFacts, gaps: [] });
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
});

test('the named env selects the base url, never the first one in file order', () => {
  const out = compose({ facts: twoEnvFacts, gaps: [] }, { env: 'prod' });
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts[0].verify.url).toBe('https://demo.example.com/health');
});

test('an env whose base url is absent stubs rather than falling back to another host', () => {
  const out = compose({ facts: twoEnvFacts, gaps: [] }, { env: 'staging' });
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
});

// Even an absolute health-path -- a full URL needing no base to join onto --
// is off the table without an env, because it would be probed with no
// credential preflight behind it.
test('no env named means an absolute health path is not probed either', () => {
  const facts = [{ kind: 'health-path', key: 'health', value: 'https://status.example.com/healthz', source: 'agent-access.json' }];
  const out = compose({ facts, gaps: [] });
  expect(out.find((s) => s.id === 'health').drafts).toHaveLength(0);
});
