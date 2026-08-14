import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
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
