import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupFile, rollback } from '../engine/backup.mjs';

test('a backup restores the exact original bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-'));
  const f = join(dir, 'runbook.md');
  writeFileSync(f, 'original\n', 'utf8');
  const b = backupFile(f);
  expect(existsSync(b)).toBe(true);
  writeFileSync(f, 'mutated\n', 'utf8');
  rollback(b);
  expect(readFileSync(f, 'utf8')).toBe('original\n');
});

// Fix 3 (2026-08-14 review): rollback stripped the backup suffix with an
// unanchored, greedy `.vibe-runbook-.*\.bak$`. A file legitimately named
// after the plugin itself -- likely, since this plugin documents itself --
// got the greedy match eating past its own real name, so the reconstructed
// path lost content. `foo.vibe-runbook-bar.md` must round-trip intact.
test('rollback round-trips a file whose own name contains .vibe-runbook-', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vrb-'));
  const f = join(dir, 'foo.vibe-runbook-bar.md');
  writeFileSync(f, 'original\n', 'utf8');
  const b = backupFile(f);
  expect(existsSync(b)).toBe(true);
  writeFileSync(f, 'mutated\n', 'utf8');
  rollback(b);
  expect(readFileSync(f, 'utf8')).toBe('original\n');
});
