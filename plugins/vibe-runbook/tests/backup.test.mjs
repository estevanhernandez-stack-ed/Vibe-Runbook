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
