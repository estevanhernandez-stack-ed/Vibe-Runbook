import { pinValue, expectedCode, verifyPin, verifyStatus, probeWriteGuard, resolveCommand } from '../engine/verify.mjs';

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

// Fix 2 (2026-08-14 re-review): the label used to be derived from raw
// claim.text, so a markdown-wrapped pin -- the real shape extract.mjs
// produces from a preamble, and the real shape in tests/fixtures/star-smoke.md
// -- keyed under the literal "**revision", not "revision". Nobody configuring
// this by hand would guess that. The fixture string below is copied verbatim
// from star-smoke.md's own preamble, not synthesized.
test('a config key uses the natural label, not the raw markdown-wrapped text (the real STAR shape)', () => {
  const claim = { text: '**Revision `star-00049-j5r`**' };
  const config = { pins: { revision: 'gcloud run services describe star --format=value(x)' } };
  expect(resolveCommand(claim, config)).toBe('gcloud run services describe star --format=value(x)');
  expect(verifyPin(claim, { runCommand: () => 'star-00049-j5r', config }).ok).toBe(true);
});

// A value-to-command rewrite marks itself with a `run:` marker immediately
// before the backticked invocation. Fix 1 (2026-08-14 review): the earlier
// shape (any backticked span with a space) had no marker at all, so
// verifyPin fell into the value-comparison path and read the *command text*
// as the expected value -- which can only match if a command echoes its own
// source. A remediated pin named its command, not a value, so there is
// nothing left to compare: it is self-answering and always PASSes, provided
// the command itself still runs. The mock below returns real command
// *output*, never the command string, so this cannot pass by echo.
test('a remediated pin is self-answering: it PASSes without comparing a stored value', () => {
  const claim = { text: 'Revision — run: `gcloud run services describe star --format=value(x)`' };
  const r = verifyPin(claim, { runCommand: () => 'star-00077-abcd' });
  expect(r.ok).toBe(true);
  expect(r.evidence).toMatch(/self-answering/i);
  expect(r.evidence).toMatch(/cannot go stale/i);
});

test('a self-answering pin is BLOCKED, not falsely PASSed, if its command fails', () => {
  const claim = { text: 'Revision — run: `gcloud run services describe star --format=value(x)`' };
  const r = verifyPin(claim, { runCommand: () => { throw new Error('not authenticated'); } });
  expect(r.blocked).toMatch(/not authenticated/);
  expect(r.ok).toBeUndefined();
});

// Fix 2 (2026-08-14 review): resolveCommand used to treat *any* backticked
// span containing a space as a command to run, which meant an ordinary
// prose value like `release candidate 3` was resolved as an invocation.
// Requiring the `run:` marker from Fix 1 closes that -- these two examples
// must resolve to no command at all.
test('an ordinary backticked value with a space is not mistaken for a command', () => {
  expect(resolveCommand({ text: 'Tag `release candidate 3`' })).toBeNull();
  expect(resolveCommand({ text: 'Version `2.1.0 (RC)`' })).toBeNull();
});

test('verifyPin never executes an ordinary backticked value as a shell command', () => {
  let calls = 0;
  const runCommand = () => {
    calls += 1;
    throw new Error('should never be invoked');
  };
  const tag = verifyPin({ text: 'Tag `release candidate 3`' }, { runCommand });
  expect(tag.blocked).toMatch(/no command/i);
  expect(calls).toBe(0);

  const version = verifyPin({ text: 'Version `2.1.0 (RC)`' }, { runCommand });
  expect(version.blocked).toMatch(/no command/i);
  expect(calls).toBe(0);
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
