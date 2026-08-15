import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorRunbook } from '../engine/author.mjs';

const fullFixture = fileURLToPath(new URL('./fixtures/app-full/', import.meta.url));
const ctx = (root) => ({
  projectRoot: root,
  appName: 'demo-app',
  runCommand: () => 'abc1234',
  probeUrl: () => 200,
});

function scratch() {
  const d = mkdtempSync(join(tmpdir(), 'vrb-author-'));
  cpSync(fullFixture, d, { recursive: true });
  return d;
}

test('writes a runbook when none exists', () => {
  const d = scratch();
  const r = authorRunbook(ctx(d));
  expect(r.wrote).toBe(true);
  expect(existsSync(join(d, 'docs', 'RUNBOOK.md'))).toBe(true);
  expect(readFileSync(join(d, 'docs', 'RUNBOOK.md'), 'utf8')).toContain('demo-app');
});

test('NEVER overwrites an existing runbook', () => {
  const d = scratch();
  mkdirSync(join(d, 'docs'), { recursive: true });
  const existing = '# My hand-written runbook\n\nDo not touch.\n';
  writeFileSync(join(d, 'docs', 'RUNBOOK.md'), existing, 'utf8');

  const r = authorRunbook(ctx(d));
  expect(r.wrote).toBe(false);
  expect(readFileSync(join(d, 'docs', 'RUNBOOK.md'), 'utf8')).toBe(existing);
  expect(existsSync(r.outPath)).toBe(true);
  expect(r.outPath).not.toBe(join(d, 'docs', 'RUNBOOK.md'));
});

test('no .env value ever reaches the emitted document', () => {
  const d = scratch();
  writeFileSync(join(d, '.env'), 'API_KEY=SENTINEL-DO-NOT-EMIT\n', 'utf8');
  const r = authorRunbook(ctx(d));
  expect(r.markdown).not.toContain('SENTINEL-DO-NOT-EMIT');
  expect(r.markdown).toContain('API_KEY');
});

test('the generated runbook passes its own walk at birth', () => {
  const d = scratch();
  const r = authorRunbook(ctx(d));
  const failed = r.sections.flatMap((s) => s.drafts).filter((x) => x.verdict === 'FAIL');
  expect(failed).toEqual([]);
});

test('an app with nothing to gather still produces an honest document', () => {
  const d = mkdtempSync(join(tmpdir(), 'vrb-bare-'));
  writeFileSync(join(d, 'README.md'), '# bare\n', 'utf8');
  const r = authorRunbook(ctx(d));
  expect(r.markdown).toMatch(/Unwritten:/);
  expect(r.markdown).toMatch(/Not gathered/);
});
