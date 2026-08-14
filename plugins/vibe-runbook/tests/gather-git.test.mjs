import { gitGatherer } from '../engine/gather/git.mjs';

const find = (ev, kind) => ev.facts.filter((f) => f.kind === kind);

test('emits HEAD as a COMMAND, never as a resolved value', () => {
  const ev = gitGatherer.run({ projectRoot: '/x', runCommand: () => 'abc1234' });
  const head = find(ev, 'head-command')[0];
  expect(head.value).toBe('git rev-parse --short HEAD');
  expect(JSON.stringify(ev)).not.toContain('abc1234');
});

test('a non-git directory is a gap, not a throw', () => {
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: () => { throw new Error('not a git repository'); },
  });
  expect(ev.facts).toHaveLength(0);
  expect(ev.gaps.join(' ')).toMatch(/not a git repository|no git/i);
});

test('records the remote when there is one', () => {
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) => (cmd.includes('remote') ? 'https://github.com/acme/demo.git' : 'abc1234'),
  });
  expect(find(ev, 'base-url').some((f) => /github.com\/acme\/demo/.test(f.value))).toBe(true);
});

test('strips a credential-bearing https remote before recording it', () => {
  const token = 'ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) =>
      cmd.includes('remote') ? `https://x-access-token:${token}@github.com/org/repo.git` : 'abc1234',
  });
  const base = find(ev, 'base-url')[0];
  expect(base.value).toBe('https://github.com/org/repo.git');
  expect(JSON.stringify(ev)).not.toContain(token);
  expect(JSON.stringify(ev)).not.toContain('x-access-token');
});

test('strips a credential-bearing GitLab-style oauth2 remote too', () => {
  const token = 'GLPAT-yyyyyyyyyyyyyyyyyyyy';
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) => (cmd.includes('remote') ? `https://oauth2:${token}@gitlab.com/org/repo.git` : 'abc1234'),
  });
  const base = find(ev, 'base-url')[0];
  expect(base.value).toBe('https://gitlab.com/org/repo.git');
  expect(JSON.stringify(ev)).not.toContain(token);
});

test('leaves a plain scp-style remote untouched — no credential to strip', () => {
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) => (cmd.includes('remote') ? 'git@github.com:acme/demo.git' : 'abc1234'),
  });
  expect(find(ev, 'base-url')[0].value).toBe('git@github.com:acme/demo.git');
});

test('records a plain ssh:// remote unchanged — a bare username is not a credential', () => {
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) => (cmd.includes('remote') ? 'ssh://git@github.com/acme/demo.git' : 'abc1234'),
  });
  expect(find(ev, 'base-url')[0].value).toBe('ssh://git@github.com/acme/demo.git');
});

test('a configured-but-non-network remote gets its own gap, distinct from "no remote"', () => {
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) => (cmd.includes('remote') ? '../mirror.git' : 'abc1234'),
  });
  expect(find(ev, 'base-url')).toHaveLength(0);
  expect(ev.gaps.join(' ')).toMatch(/not shaped like a network address/);
  expect(ev.gaps.join(' ')).not.toMatch(/no git remote configured/);
  // The gap names the situation, not the raw value — a non-network-shaped
  // string reaching this branch still shouldn't be echoed verbatim.
  expect(ev.gaps.join(' ')).not.toMatch(/mirror\.git/);
});

test('a genuinely missing remote still says "no git remote configured"', () => {
  const ev = gitGatherer.run({
    projectRoot: '/x',
    runCommand: (cmd) => {
      if (cmd.includes('remote')) throw new Error('no such remote origin');
      return 'abc1234';
    },
  });
  expect(find(ev, 'base-url')).toHaveLength(0);
  expect(ev.gaps).toContain('no git remote configured');
});
