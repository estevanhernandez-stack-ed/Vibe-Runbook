import { pickTemplate, proposeRewrite, planRemediation, renderPlan } from '../engine/remediate.mjs';

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

// ---------------------------------------------------------------------------
// Fix 4 (2026-08-14 final review): /vibe-runbook:remediate was advertised in
// the command surface, described in prose in its SKILL, and named twice by
// every walk report -- with no entry point anywhere. cli.mjs dispatched `scan`
// and `walk` only, and proposeRewrite / backupFile / rollback had zero
// production callers. An agent asked to run it would hand-roll the rewrite and
// bypass the tested, backed-up implementation entirely.
// ---------------------------------------------------------------------------

const failedRevisionPin = {
  ...revisionPin, verdict: 'FAIL', evidence: 'runbook says star-00049-j5r, system says star-00099-NEW',
  source: { file: 'star-smoke.md', line: 4 },
};

test('a FAILed pin whose command config knows becomes a proposal', () => {
  const plan = planRemediation([failedRevisionPin], { pins: { revision: 'gcloud run services describe star' } });

  expect(plan.proposals).toHaveLength(1);
  expect(plan.proposals[0].template).toBe('value-to-command');
  expect(plan.proposals[0].after).toContain('gcloud run services describe star');
  expect(plan.needsContext).toHaveLength(0);
});

// "Never invent the context" is the SKILL's rule and the whole reason the
// templates refuse. A pin with no command is reported as needing one, not
// guessed at and not silently dropped -- the walk report routes exactly these
// claims here, so dropping them dead-ends the loop it was pointed at.
test('a pin with no command is reported as needing one, never guessed', () => {
  const plan = planRemediation([{ ...failedRevisionPin, verdict: 'BLOCKED', evidence: 'no command for this pin' }], {});

  expect(plan.proposals).toHaveLength(0);
  expect(plan.needsContext).toHaveLength(1);
  expect(plan.needsContext[0].id).toBe('c-001');
  expect(plan.needsContext[0].ask).toMatch(/config\.pins/);
});

test('a static-venue pin takes its members from config, or asks for them', () => {
  const stale = { ...toolCountPin, verdict: 'FAIL', source: { file: 'README.md', line: 12 } };

  const withMembers = planRemediation([stale], { members: { 'c-002': ['list_rooms', 'get_room'] } });
  expect(withMembers.proposals[0].template).toBe('name-not-count');
  expect(withMembers.proposals[0].after).toContain('list_rooms');

  const without = planRemediation([stale], {});
  expect(without.proposals).toHaveLength(0);
  expect(without.needsContext[0].ask).toMatch(/config\.members/);
});

test('a passing pin is not stale, and is left alone', () => {
  const plan = planRemediation([{ ...revisionPin, verdict: 'PASS' }], { pins: { revision: 'git rev-parse HEAD' } });
  expect(plan.proposals).toHaveLength(0);
  expect(plan.needsContext).toHaveLength(0);
});

test('nothing but a pin is planned, whatever its verdict', () => {
  const plan = planRemediation([
    { id: 'c-9', shape: 'receipt', venue: 'executable', text: 'over all 17 rooms', verdict: 'QUESTION' },
    { id: 'c-8', shape: 'status-assertion', venue: 'executable', text: 'answers 401', verdict: 'FAIL' },
  ], {});
  expect(plan.proposals).toHaveLength(0);
  expect(plan.needsContext).toHaveLength(0);
});

// A pin that already names its command has no stored value left to drift. It
// is the destination of this whole command, not a candidate for it.
test('an already-remediated pin is not remediated again', () => {
  const plan = planRemediation([{
    id: 'c-3', shape: 'pin', venue: 'executable', text: 'Revision — run: `git rev-parse --short HEAD`',
    verdict: 'BLOCKED', evidence: 'command failed: not authenticated', source: { file: 'r.md', line: 2 },
  }], {});
  expect(plan.proposals).toHaveLength(0);
  expect(plan.needsContext).toHaveLength(0);
});

// The label used to come off raw claim.text, so the real shape extract.mjs
// produces from a preamble -- "**Revision `star-00049-j5r`**" -- rewrote to
// "**Revision — run: `...`", leaving a dangling `**` in the user's document.
// verify.mjs's resolveCommand already normalizes with stripOuterMarkup; the
// rewrite has to use the same normalizer or wiring it up ships broken markdown.
test('a markdown-wrapped pin rewrites to a clean label, not a dangling delimiter', () => {
  const r = proposeRewrite(
    { ...revisionPin, text: '**Revision `star-00049-j5r`**' },
    { command: 'git rev-parse --short HEAD' },
  );
  expect(r.after).toBe('Revision — run: `git rev-parse --short HEAD`');
  expect(r.after).not.toContain('**');
  // `before` stays verbatim: it is matched byte-for-byte against the file.
  expect(r.before).toBe('**Revision `star-00049-j5r`**');
});

test('the rendered plan shows every diff and says plainly that nothing was written', () => {
  const out = renderPlan(
    planRemediation([failedRevisionPin], { pins: { revision: 'gcloud run services describe star' } }),
    { applied: false },
  );
  expect(out).toContain('c-001');
  expect(out).toContain('star-smoke.md:4');
  expect(out).toContain('- Revision `star-00049-j5r`');
  expect(out).toContain('+ Revision — run: `gcloud run services describe star`');
  expect(out).toMatch(/nothing was written/i);
  expect(out).toMatch(/--apply/);
});

test('a plan with nothing in it says so rather than rendering an empty section', () => {
  const out = renderPlan(planRemediation([], {}), { applied: false });
  expect(out).toMatch(/no stale pins/i);
});
