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

test('gaps are carried into notes so the document says what could not be gathered', () => {
  const out = compose({ facts: [], gaps: ['no Dockerfile, so the container port was not derived'] });
  expect(out.some((s) => s.notes.some((n) => /no Dockerfile/.test(n)))).toBe(true);
});
