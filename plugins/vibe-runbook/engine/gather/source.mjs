import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeEvidence } from './contract.mjs';

const RUN_SCRIPTS = ['start', 'dev', 'serve'];
const DEPLOY_SCRIPTS = [/^deploy/i, /^publish/i];
const ROLLBACK_SCRIPTS = [/^rollback/i, /^revert/i];
// 2026-08-14 whole-branch review: `log-command` was consumed by compose.mjs
// and emitted by nothing, which made "Logs and observability" structurally
// unfillable on every project, forever -- including a project whose log
// command was sitting in its own package.json. `npm run logs` (wrangler
// tail, firebase functions:log, gcloud logging read) is the cowpath.
const LOG_SCRIPTS = [/^log/i];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export const sourceGatherer = {
  name: 'source',
  run({ projectRoot }) {
    const facts = [];
    const gaps = [];

    const pkgPath = join(projectRoot, 'package.json');
    const pkg = existsSync(pkgPath) ? readJson(pkgPath) : null;
    if (!pkg) {
      gaps.push('no package.json, so no run or test command was derived');
    } else {
      for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
        if (RUN_SCRIPTS.includes(name)) {
          facts.push({ kind: 'run-command', key: name, value: `npm run ${name}`, source: 'package.json' });
        }
        if (name === 'test') {
          facts.push({ kind: 'test-command', key: 'test', value: 'npm test', source: 'package.json' });
        }
        if (LOG_SCRIPTS.some((re) => re.test(name))) {
          facts.push({ kind: 'log-command', key: name, value: `npm run ${name}`, source: 'package.json' });
        }
        const port = String(cmd).match(/--port[= ](\d+)/);
        if (port) facts.push({ kind: 'port', key: name, value: port[1], source: 'package.json' });
      }
    }

    const scriptsDir = join(projectRoot, 'scripts');
    if (existsSync(scriptsDir)) {
      for (const f of readdirSync(scriptsDir)) {
        const rel = `./scripts/${f}`;
        if (DEPLOY_SCRIPTS.some((re) => re.test(f))) {
          facts.push({ kind: 'deploy-command', key: f, value: rel, source: rel });
        }
        if (ROLLBACK_SCRIPTS.some((re) => re.test(f))) {
          facts.push({ kind: 'rollback-command', key: f, value: rel, source: rel });
        }
      }
    } else {
      gaps.push('no scripts/ directory, so deploy and rollback were not derived');
    }

    // KEY NAMES ONLY. A generator writes to a file that gets committed, so a
    // value read out of .env.example must never reach a fact.
    const envPath = join(projectRoot, '.env.example');
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
        if (m) facts.push({ kind: 'env-key', key: m[1], value: '', source: '.env.example' });
      }
    } else {
      gaps.push('no .env.example, so required configuration was not derived');
    }

    const dockerPath = join(projectRoot, 'Dockerfile');
    if (existsSync(dockerPath)) {
      const expose = readFileSync(dockerPath, 'utf8').match(/^\s*EXPOSE\s+(\d+)/im);
      if (expose) facts.push({ kind: 'port', key: 'container', value: expose[1], source: 'Dockerfile' });
    } else {
      gaps.push('no Dockerfile, so the container port was not derived');
    }

    return makeEvidence('source', { facts, gaps });
  },
};
