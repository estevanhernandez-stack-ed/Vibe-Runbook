import { verifyDrafts } from '../engine/author.mjs';

const sections = [
  {
    id: 'header', title: 'h', notes: [], stubs: [],
    // No `command` on verify -- compose.mjs stopped emitting one, because
    // forwarding it is what pushed verifyPin off its self-answering path.
    drafts: [{ text: 'HEAD — run: `git rev-parse --short HEAD`', kind: 'pin', verify: { type: 'pin' } }],
  },
  {
    id: 'health', title: 'h', notes: [], stubs: [],
    drafts: [{ text: '**Right:** `/api/health` answers 200.', kind: 'status-assertion', verify: { type: 'status', url: 'https://x/api/health' } }],
  },
  {
    id: 'deploy', title: 'd', notes: [], stubs: [],
    drafts: [{ text: 'Deploy with `./scripts/deploy.sh`.', kind: 'step', verify: { type: 'none' } }],
  },
];

test('a self-answering pin verifies as PASS at birth', () => {
  const out = verifyDrafts(sections, { runCommand: () => 'abc1234', probeUrl: () => 200 });
  expect(out[0].drafts[0].verdict).toBe('PASS');
});

test('a health assertion that answers is PASS and carries its evidence', () => {
  const out = verifyDrafts(sections, { runCommand: () => 'abc1234', probeUrl: () => 200 });
  expect(out[1].drafts[0].verdict).toBe('PASS');
  expect(out[1].drafts[0].evidence).toMatch(/200/);
});

test('an unreachable probe is BLOCKED, never FAIL — the doc is not wrong, the environment is', () => {
  const out = verifyDrafts(sections, {
    runCommand: () => 'abc1234',
    probeUrl: () => { throw new Error('ECONNREFUSED'); },
  });
  expect(out[1].drafts[0].verdict).toBe('BLOCKED');
});

test('a verify.type of none is never executed and carries no verdict', () => {
  let called = false;
  const out = verifyDrafts(sections, {
    runCommand: (c) => { if (/deploy/.test(c)) called = true; return 'abc1234'; },
    probeUrl: () => 200,
  });
  expect(called).toBe(false);
  expect(out[2].drafts[0].verdict).toBeNull();
});
