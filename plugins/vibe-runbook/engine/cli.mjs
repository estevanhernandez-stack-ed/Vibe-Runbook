#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { scanRunbook } from './scan.mjs';
import { preflight } from './preflight.mjs';
import { verifyPin, verifyStatus } from './verify.mjs';
import { assignVerdict } from './verdict.mjs';
import { renderReport } from './report.mjs';

const shell = (cmd) => execSync(cmd, { encoding: 'utf8' });

// Never prints the credential, only whether one is present and what to ask for.
const credentialFor = (env) => {
  const token = process.env[`VIBE_RUNBOOK_${env.toUpperCase()}_TOKEN`];
  return token
    ? { present: true }
    : { present: false, ask: `set VIBE_RUNBOOK_${env.toUpperCase()}_TOKEN for environment "${env}"` };
};

const probe = (url) => {
  const out = execSync(`curl -s -o /dev/null -w "%{http_code}" ${JSON.stringify(url)}`, { encoding: 'utf8' });
  return Number.parseInt(out.trim(), 10);
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const command = process.argv[2];

if (command === 'scan') {
  const runbook = arg('runbook');
  if (!runbook) { console.error('scan needs --runbook <path>'); process.exit(1); }
  const out = scanRunbook(readFileSync(runbook, 'utf8'), runbook);
  const dest = join(process.cwd(), '.vibe-runbook', 'state', 'claims.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`scanned ${out.claims.length} claims, confidence ${out.coverage.confidence}`);
} else if (command === 'walk') {
  const env = arg('env');
  if (!env) { console.error('walk needs --env <name>; there is no default environment'); process.exit(1); }

  const statePath = join(process.cwd(), '.vibe-runbook', 'state', 'claims.json');
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    console.error('no cached scan; run `vibe-runbook scan --runbook <path>` first');
    process.exit(1);
  }

  const pre = preflight({ env, credentialCheck: () => credentialFor(env) });
  if (!pre.ok) {
    console.error(`BLOCKED: ${pre.blocked}`);
    console.error(`ask: ${pre.ask}`);
    process.exit(1);
  }

  const walked = state.claims.map((c) => {
    if (c.shape === 'pin') return assignVerdict(c, verifyPin(c, { runCommand: shell }));
    if (c.shape === 'status-assertion') return assignVerdict(c, verifyStatus(c, { httpProbe: probe }));
    return assignVerdict(c, null);
  });

  writeFileSync(statePath, `${JSON.stringify({ ...state, env, claims: walked }, null, 2)}\n`, 'utf8');
  console.log(renderReport({ runbook: state.runbook, env, claims: walked, coverage: state.coverage }));
} else {
  console.error('usage: vibe-runbook <scan|walk> [--runbook <path>] [--env <name>]');
  process.exit(1);
}
