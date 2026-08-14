import { makeEvidence } from './contract.mjs';

// A remote URL carries a credential when its userinfo section (the part
// between the scheme and the "@") contains a colon — user:token@host, the
// pattern CI systems inject a scoped token through. A bare user@host (plain
// scp-style, or an ordinary ssh username) has no colon there and is left
// untouched. Never record the credential form: a generator writes this fact
// into a committed file.
function stripRemoteCredential(remote) {
  const m = remote.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^@/]+)@(.*)$/);
  if (m && m[2].includes(':')) {
    return `${m[1]}${m[3]}`;
  }
  return remote;
}

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
      const rawRemote = String(runCommand('git config --get remote.origin.url')).trim();
      if (!rawRemote) {
        gaps.push('no git remote configured');
      } else if (!/:\/\/|@/.test(rawRemote)) {
        // A remote IS configured — it just doesn't have a network-address
        // shape (e.g. a local path like "../mirror.git"). That is a
        // different situation from no remote at all, so it gets its own
        // message; reusing "no git remote configured" here would be false.
        // Don't interpolate the raw value into the message: this branch only
        // proves the string ISN'T URL-shaped, not that it's safe to print —
        // the discarded HEAD probe's return could reach here too.
        gaps.push('git remote is configured but is not shaped like a network address (no scheme or user@host), so no base url was recorded');
      } else {
        // A remote URL has a recognizable shape (scheme or scp-style
        // user@host). Don't trust an arbitrary truthy string as a base-url
        // fact — that's how a raw revision hash from a non-discriminating
        // runner would leak in. Strip any embedded credential before it
        // becomes a fact — see stripRemoteCredential above.
        facts.push({
          kind: 'base-url',
          key: 'remote',
          value: stripRemoteCredential(rawRemote),
          source: 'git',
        });
      }
    } catch {
      // The lookup itself failed — this IS the genuinely-absent case.
      gaps.push('no git remote configured');
    }

    return makeEvidence('git', { facts, gaps });
  },
};
