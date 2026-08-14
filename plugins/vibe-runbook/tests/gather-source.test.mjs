import { fileURLToPath } from 'node:url';
import { sourceGatherer } from '../engine/gather/source.mjs';

const full = fileURLToPath(new URL('./fixtures/app-full/', import.meta.url));
const bare = fileURLToPath(new URL('./fixtures/app-bare/', import.meta.url));
const find = (ev, kind) => ev.facts.filter((f) => f.kind === kind);

test('finds run and test commands from package.json scripts', () => {
  const ev = sourceGatherer.run({ projectRoot: full });
  expect(find(ev, 'run-command').map((f) => f.value)).toContain('npm run start');
  expect(find(ev, 'test-command').map((f) => f.value)).toContain('npm test');
});

test('finds deploy and rollback scripts by name', () => {
  const ev = sourceGatherer.run({ projectRoot: full });
  expect(find(ev, 'deploy-command')[0].value).toMatch(/deploy\.sh/);
  expect(find(ev, 'rollback-command')[0].value).toMatch(/rollback\.sh/);
});

test('emits env KEY NAMES and never values', () => {
  const ev = sourceGatherer.run({ projectRoot: full });
  const keys = find(ev, 'env-key').map((f) => f.key);
  expect(keys).toEqual(expect.arrayContaining(['API_KEY', 'DATABASE_URL']));
  const serialized = JSON.stringify(ev);
  expect(serialized).not.toContain('put-your-key-here');
  expect(serialized).not.toContain('postgres://localhost/demo');
});

test('finds a port from the Dockerfile EXPOSE', () => {
  const ev = sourceGatherer.run({ projectRoot: full });
  expect(find(ev, 'port').map((f) => f.value)).toContain('8080');
});

test('the bare app yields no facts and says what was missing', () => {
  const ev = sourceGatherer.run({ projectRoot: bare });
  expect(ev.facts).toHaveLength(0);
  expect(ev.gaps.join(' ')).toMatch(/package\.json/);
  expect(ev.gaps.join(' ')).toMatch(/Dockerfile/);
});
