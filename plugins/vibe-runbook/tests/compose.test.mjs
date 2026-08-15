import { compose, SECTIONS } from '../engine/compose.mjs';

const facts = [
  { kind: 'head-command', key: 'HEAD', value: 'git rev-parse --short HEAD', source: 'git' },
  { kind: 'run-command', key: 'start', value: 'npm run start', source: 'package.json' },
  { kind: 'env-key', key: 'API_KEY', value: '', source: '.env.example' },
  { kind: 'deploy-command', key: 'deploy.sh', value: './scripts/deploy.sh', source: './scripts/deploy.sh' },
  { kind: 'health-path', key: 'health', value: '/api/health', source: 'agent-access.json' },
  { kind: 'base-url', key: 'prod', value: 'https://demo.example.com', source: 'agent-access.json' },
];

test('sections come back in a fixed order', () => {
  const out = compose({ facts, gaps: [] });
  expect(out.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
});

test('a pin drafts as a COMMAND, never as a value', () => {
  const out = compose({ facts, gaps: [] });
  const header = out.find((s) => s.id === 'header');
  const pin = header.drafts.find((d) => /HEAD/i.test(d.text));
  expect(pin.text).toContain('run: `git rev-parse --short HEAD`');
  expect(pin.verify).toEqual({ type: 'pin', command: 'git rev-parse --short HEAD' });
});

test('a health path plus a base url drafts a checkable status assertion', () => {
  const out = compose({ facts, gaps: [] });
  const health = out.find((s) => s.id === 'health');
  const d = health.drafts[0];
  expect(d.verify.type).toBe('status');
  expect(d.verify.url).toBe('https://demo.example.com/api/health');
});

test('deploy is recorded and explicitly NOT verifiable by running it', () => {
  const out = compose({ facts, gaps: [] });
  const deploy = out.find((s) => s.id === 'deploy');
  expect(deploy.drafts[0].text).toContain('./scripts/deploy.sh');
  expect(deploy.drafts[0].verify.type).toBe('none');
});

test('env keys are drafted by NAME with no value anywhere', () => {
  const out = compose({ facts, gaps: [] });
  const run = out.find((s) => s.id === 'run');
  expect(JSON.stringify(run)).toContain('API_KEY');
  expect(JSON.stringify(run)).not.toMatch(/=\s*\S/);
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
    const out = compose({ facts, gaps: [] });
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
  const out = compose({ facts, gaps: [] });
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts).toHaveLength(0);
  expect(health.stubs.length).toBeGreaterThan(0);
});

// Fix 4 (review): an absolute health-path (unreachable via manifest.mjs
// today, but not guarded against) must be used as-is, not concatenated onto
// a base url, or the result is a doubled, non-existent URL.
test('an absolute health path is used as-is, never concatenated onto a base url', () => {
  const facts = [
    { kind: 'base-url', key: 'prod', value: 'https://demo.example.com', source: 'agent-access.json' },
    { kind: 'health-path', key: 'health', value: 'https://status.example.com/healthz', source: 'agent-access.json' },
  ];
  const out = compose({ facts, gaps: [] });
  const health = out.find((s) => s.id === 'health');
  expect(health.drafts[0].verify.url).toBe('https://status.example.com/healthz');
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
  const out = compose({ facts, gaps: [] });
  expect(out.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
});
