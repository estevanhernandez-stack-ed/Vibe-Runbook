import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeEvidence } from './contract.mjs';

const CANDIDATES = ['agent-access.json', '.vibe-access/agent-access.json'];

export const manifestGatherer = {
  name: 'manifest',
  run({ projectRoot }) {
    const facts = [];
    const gaps = [];

    const found = CANDIDATES.map((c) => join(projectRoot, c)).find((p) => existsSync(p));
    if (!found) {
      gaps.push('no agent-access.json, so routes and base urls were derived from source instead');
      return makeEvidence('manifest', { facts, gaps });
    }

    let m;
    try {
      m = JSON.parse(readFileSync(found, 'utf8'));
    } catch (e) {
      gaps.push(`agent-access.json could not be parsed: ${e.message}`);
      return makeEvidence('manifest', { facts, gaps });
    }

    for (const [env, url] of Object.entries(m.baseUrls ?? {})) {
      facts.push({ kind: 'base-url', key: env, value: url, source: 'agent-access.json' });
    }

    for (const a of m.affordances ?? []) {
      facts.push({ kind: 'route', key: a.name, value: a.path, source: 'agent-access.json' });
      // Only a prod-safe read is a health candidate. A mutating or dev-only
      // affordance must never be proposed as something to poll.
      if (a.method === 'GET' && a.tier === 'prod-safe') {
        facts.push({ kind: 'health-path', key: a.name, value: a.path, source: 'agent-access.json' });
      }
    }

    return makeEvidence('manifest', { facts, gaps });
  },
};
