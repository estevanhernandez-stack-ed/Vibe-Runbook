import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Ladder: the blessed variable, then the legacy family path, then fail LOUD.
// Never silently skip a write -- that is the Cart blackout lesson.
export function dataHome() {
  const blessed = process.env.CLAUDE_PLUGIN_DATA;
  const dir = blessed || join(homedir(), '.claude', 'plugins', 'data', 'vibe-runbook');
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    throw new Error(`vibe-runbook could not resolve a writable data home (${dir}): ${e.message}`);
  }
  return dir;
}
