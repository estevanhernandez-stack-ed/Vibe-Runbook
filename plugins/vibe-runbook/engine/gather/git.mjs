import { makeEvidence } from './contract.mjs';

export const gitGatherer = {
  name: 'git',
  run({ projectRoot, runCommand }) {
    const facts = [];
    const gaps = [];

    try {
      // Probe only to confirm this IS a repo. The VALUE is deliberately
      // discarded: a pin must emit as the command that answers it, so there is
      // no stored value to go stale.
      runCommand('git rev-parse --short HEAD');
      facts.push({
        kind: 'head-command',
        key: 'HEAD',
        value: 'git rev-parse --short HEAD',
        source: 'git',
      });
    } catch (e) {
      gaps.push(`no git revision available: ${e.message}`);
      return makeEvidence('git', { facts, gaps });
    }

    try {
      const remote = String(runCommand('git config --get remote.origin.url')).trim();
      // A remote URL has a recognizable shape (scheme or scp-style user@host).
      // Don't trust an arbitrary truthy string as a base-url fact — that's how
      // a raw revision hash from a non-discriminating runner would leak in.
      if (remote && /:\/\/|@/.test(remote)) {
        facts.push({ kind: 'base-url', key: 'remote', value: remote, source: 'git' });
      } else {
        gaps.push('no git remote configured');
      }
    } catch {
      gaps.push('no git remote configured');
    }

    return makeEvidence('git', { facts, gaps });
  },
};
