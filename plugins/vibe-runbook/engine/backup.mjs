import { copyFileSync } from 'node:fs';

export function backupFile(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${path}.vibe-runbook-${stamp}.bak`;
  copyFileSync(path, backupPath);
  return backupPath;
}

export function rollback(backupPath) {
  const original = backupPath.replace(/\.vibe-runbook-.*\.bak$/, '');
  copyFileSync(backupPath, original);
}
