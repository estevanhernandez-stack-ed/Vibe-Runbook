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
