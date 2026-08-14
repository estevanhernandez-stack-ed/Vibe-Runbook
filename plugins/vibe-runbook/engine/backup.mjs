import { copyFileSync } from 'node:fs';

// The stamp is `new Date().toISOString()` with every `:` and `.` swapped
// for `-`, e.g. 2026-08-14T19:03:45.123Z -> 2026-08-14T19-03-45-123Z. Its
// shape is fixed, so the suffix backupFile appends is matched precisely
// here rather than with a greedy `.*` (Fix 3, 2026-08-14 review). The
// unanchored, greedy version stripped past a target file's own name
// whenever that name happened to contain the literal substring
// `.vibe-runbook-` -- likely for this plugin specifically, since it
// documents itself and files named after it are not exotic.
const BACKUP_SUFFIX_RE = /\.vibe-runbook-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.bak$/;

export function backupFile(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${path}.vibe-runbook-${stamp}.bak`;
  copyFileSync(path, backupPath);
  return backupPath;
}

export function rollback(backupPath) {
  const original = backupPath.replace(BACKUP_SUFFIX_RE, '');
  copyFileSync(backupPath, original);
}
