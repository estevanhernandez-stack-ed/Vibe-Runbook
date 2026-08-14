import { fileURLToPath } from 'node:url';
import { manifestGatherer } from '../engine/gather/manifest.mjs';

const full = fileURLToPath(new URL('./fixtures/app-full/', import.meta.url));
const bare = fileURLToPath(new URL('./fixtures/app-bare/', import.meta.url));
const find = (ev, kind) => ev.facts.filter((f) => f.kind === kind);

test('reads baseUrls and routes from a vibe-access manifest', () => {
  const ev = manifestGatherer.run({ projectRoot: full });
  expect(find(ev, 'base-url').map((f) => f.value)).toContain('https://demo.example.com');
  expect(find(ev, 'route').map((f) => f.value)).toContain('/api/health');
});

test('a prod-safe GET route becomes a health path candidate', () => {
  const ev = manifestGatherer.run({ projectRoot: full });
  expect(find(ev, 'health-path').map((f) => f.value)).toContain('/api/health');
});

test('a dev-only or mutating affordance never becomes a health path', () => {
  const ev = manifestGatherer.run({ projectRoot: full });
  expect(find(ev, 'health-path').map((f) => f.value)).not.toContain('/api/seed');
});

test('no manifest is a gap, not an error', () => {
  const ev = manifestGatherer.run({ projectRoot: bare });
  expect(ev.facts).toHaveLength(0);
  expect(ev.gaps.join(' ')).toMatch(/agent-access\.json/);
});
