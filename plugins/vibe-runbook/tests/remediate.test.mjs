import { pickTemplate, proposeRewrite } from '../engine/remediate.mjs';

const revisionPin = {
  id: 'c-001', shape: 'pin', venue: 'executable',
  text: 'Revision `star-00049-j5r`',
};
const toolCountPin = {
  id: 'c-002', shape: 'pin', venue: 'static',
  text: 'There are six tools',
};

test('an executable-venue pin gets value-to-command', () => {
  expect(pickTemplate(revisionPin)).toBe('value-to-command');
});

test('a static-venue pin gets name-not-count', () => {
  expect(pickTemplate(toolCountPin)).toBe('name-not-count');
});

test('nothing but a pin is remediated', () => {
  expect(pickTemplate({ shape: 'receipt', venue: 'executable' })).toBeNull();
  expect(pickTemplate({ shape: 'human', venue: 'executable' })).toBeNull();
  expect(pickTemplate({ shape: 'status-assertion', venue: 'executable' })).toBeNull();
});

// Fix 1 (2026-08-14 review): a bare backticked invocation was indistinguishable
// from a bare backticked value, so verifyPin re-scanned the rewrite as an
// ordinary pin and compared the command *text* against the command's
// *output* -- which can only match if a command echoes its own source. The
// rewrite now emits a machine-recognizable `run:` marker so a remediated pin
// can be told apart from a stale one on sight, by a human and by verify.mjs.
test('value-to-command replaces the value with a run: marker plus the invocation', () => {
  const r = proposeRewrite(revisionPin, { command: 'gcloud run services describe star --format=...' });
  expect(r.template).toBe('value-to-command');
  expect(r.after).toBe('Revision — run: `gcloud run services describe star --format=...`');
  expect(r.after).toContain('gcloud run services describe star');
  expect(r.after).not.toContain('star-00049-j5r');
});

test('name-not-count removes the count rather than correcting it', () => {
  const r = proposeRewrite(toolCountPin, { members: ['list_rooms', 'get_room', 'ask_room'] });
  expect(r.template).toBe('name-not-count');
  expect(r.after).toContain('list_rooms');
  expect(r.after).not.toMatch(/\bsix\b|\bthree\b|\b3\b/);
});

test('a rewrite without its context is refused, not guessed', () => {
  expect(() => proposeRewrite(revisionPin, {})).toThrow(/command/i);
  expect(() => proposeRewrite(toolCountPin, {})).toThrow(/members/i);
});
