import { pinValue, expectedCode, verifyPin, verifyStatus, probeWriteGuard } from '../engine/verify.mjs';

test('pulls the value out of a pin', () => {
  expect(pinValue('Revision `star-00049-j5r`')).toBe('star-00049-j5r');
  expect(pinValue('HEAD `0855bd2`')).toBe('0855bd2');
  expect(pinValue('931 tests green')).toBe('931');
});

test('pulls the expected status code out of an assertion', () => {
  expect(expectedCode('Every new route answers 401 unauthenticated')).toBe(401);
  expect(expectedCode('the health endpoint returns 200')).toBe(200);
  expect(expectedCode('nothing here has a code')).toBeNull();
});

test('a pin whose command output differs is a FAIL carrying both values', () => {
  const claim = { text: 'Revision `star-00049-j5r`', command: 'gcloud ...' };
  const r = verifyPin(claim, { runCommand: () => 'star-00052-7jb' });
  expect(r.ok).toBe(false);
  expect(r.evidence).toContain('star-00049-j5r');
  expect(r.evidence).toContain('star-00052-7jb');
});

test('a pin whose command output matches is a PASS', () => {
  const claim = { text: 'HEAD `216b917`', command: 'git rev-parse --short HEAD' };
  expect(verifyPin(claim, { runCommand: () => '216b917' }).ok).toBe(true);
});

test('a pin with no command to run is BLOCKED, never FAIL', () => {
  const r = verifyPin({ text: 'Revision `x`' }, { runCommand: () => 'y' });
  expect(r.blocked).toMatch(/no command/i);
  expect(r.ok).toBeUndefined();
});

test('a command comes from config when the pin is a bare value', () => {
  const claim = { text: 'HEAD `216b917`' };
  const config = { pins: { head: 'git rev-parse --short HEAD' } };
  expect(verifyPin(claim, { runCommand: () => '216b917', config }).ok).toBe(true);
});

// A value-to-command rewrite leaves the invocation in backticks, so the fix
// for staleness is also what makes the claim checkable without config.
test('a remediated pin is self-verifying', () => {
  const claim = { text: 'revision: `gcloud run services describe star --format=value(x)`' };
  const r = verifyPin(claim, { runCommand: () => 'gcloud run services describe star --format=value(x)' });
  expect(r.ok).toBe(true);
});

test('a status assertion compares the observed code', () => {
  const claim = { text: 'answers 401 unauthenticated', url: '/api/rooms' };
  expect(verifyStatus(claim, { httpProbe: () => 401 }).ok).toBe(true);
  const bad = verifyStatus(claim, { httpProbe: () => 422 });
  expect(bad.ok).toBe(false);
  expect(bad.evidence).toContain('422');
});

test('an unreachable probe is BLOCKED, not FAIL', () => {
  const claim = { text: 'answers 401', url: '/x' };
  const r = verifyStatus(claim, { httpProbe: () => { throw new Error('ECONNREFUSED'); } });
  expect(r.blocked).toMatch(/ECONNREFUSED/);
});

// Controller correction to Task 8: nothing in the pipeline populates `url`
// yet, so a status assertion with no url must be BLOCKED (unreachable),
// never a call into the probe with undefined. Mirrors verifyPin's
// missing-command guard.
test('a status assertion with no url is BLOCKED, never a call into the probe', () => {
  const claim = { text: 'answers 401 unauthenticated' };
  const r = verifyStatus(claim, { httpProbe: () => { throw new Error('should not be called'); } });
  expect(r.blocked).toMatch(/no url/i);
  expect(r.ok).toBeUndefined();
});

// The technique from the STAR walk. 401 means auth ran first and the claim
// holds. A validation code means auth did NOT run first, which is itself the
// finding -- and nothing was written or spent either way.
test('the write-guard probe reads 401 as the guard holding', () => {
  const r = probeWriteGuard({ path: '/api/rooms', expected: 401 }, { post: () => 401 });
  expect(r.ok).toBe(true);
});

test('the write-guard probe reads a validation code as the finding', () => {
  const r = probeWriteGuard({ path: '/api/rooms', expected: 401 }, { post: () => 422 });
  expect(r.ok).toBe(false);
  expect(r.evidence).toMatch(/422/);
  expect(r.evidence).toMatch(/before auth/i);
});
