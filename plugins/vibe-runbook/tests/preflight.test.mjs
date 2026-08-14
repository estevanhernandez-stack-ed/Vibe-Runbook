import { preflight } from '../engine/preflight.mjs';

test('a present credential passes and names the environment', () => {
  const r = preflight({ env: 'live', credentialCheck: () => ({ present: true }) });
  expect(r.ok).toBe(true);
  expect(r.env).toBe('live');
});

test('a missing credential hard-stops with an exact ask', () => {
  const r = preflight({ env: 'live', credentialCheck: () => ({ present: false, ask: 'run /mcp and authorize STAR' }) });
  expect(r.ok).toBe(false);
  expect(r.blocked).toMatch(/credential/i);
  expect(r.ask).toBe('run /mcp and authorize STAR');
});

test('it never substitutes a different environment', () => {
  const r = preflight({ env: 'live', credentialCheck: () => ({ present: false, ask: 'x' }) });
  expect(r.env).toBeUndefined();
  expect(JSON.stringify(r)).not.toMatch(/local/i);
});

test('an unnamed environment is refused rather than defaulted', () => {
  expect(() => preflight({ credentialCheck: () => ({ present: true }) })).toThrow(/environment must be named/i);
});
