import { stripOuterMarkup, stripLeadingListPunctuation } from './classify.mjs';

// Codes a framework returns when it validated the body before checking auth.
const VALIDATION_CODES = new Set([400, 422]);

export function pinValue(text) {
  const backticked = text.match(/`([^`]+)`/);
  if (backticked) return backticked[1];
  const number = text.match(/\b(\d+)\b/);
  return number ? number[1] : null;
}

export function expectedCode(text) {
  const m = text.match(/\b([1-5]\d{2})\b/);
  return m ? Number.parseInt(m[1], 10) : null;
}

// A `run:` marker immediately before a backticked span is the sole signal
// that the span is an invocation rather than a value (Fix 1, 2026-08-14
// review). Requiring the marker -- instead of "any backticked span with a
// space" -- is also what stops an ordinary prose value like
// `release candidate 3` from being resolved as a command to execute
// (Fix 2, same review): once a real shell is wired in, running a user's
// version string as a command is the failure mode that guards against.
const SELF_ANSWERING_RE = /run:\s*`([^`]+)`/i;

// Exported so remediation can tell a pin that already names its command apart
// from one that still stores a value. A self-answering pin is where this
// plugin is trying to get every pin to; proposing a rewrite for it would be
// rewriting the destination.
export function isSelfAnswering(claim) {
  return SELF_ANSWERING_RE.test(claim.text ?? '');
}

// Where a pin's command comes from, in order:
//   1. The pin itself, if it has already been remediated with a `run:`
//      marker. See verifyPin below -- this case is self-answering and
//      never reaches the comparison this function feeds.
//   2. .vibe-runbook/config.json, keyed by the pin's label.
//   3. Nothing, which is BLOCKED and points at the remediation.
//
// The label used to be split off raw claim.text, so a markdown-wrapped pin
// -- "**Revision `star-00049-j5r`**", the real shape extract.mjs produces
// from a preamble -- keyed under the literal "**revision", not "revision"
// (Fix 2, 2026-08-14 re-review: nobody hand-writing config.pins would guess
// that key, and guessing wrong reads as a BLOCKED telling them to add an
// entry they already added). classify.mjs's stripOuterMarkup already solves
// "peel the wrapping a runbook author's markdown adds, without touching
// content that happens to sit at the edges" for rule matching; reused here
// rather than re-solving it, so there is one normalizer, not two.
//
// Round 3, Fix 3: the same drift, one layer earlier. classify.mjs's pin
// rule tolerates a leading list/quote marker before the label ("- revision:
// ...", STAR's own real header pin), but this derivation didn't strip that
// same prefix -- a claim that correctly classified as `pin` and showed a
// config key a user would reasonably guess ("revision") still couldn't
// resolve it, because the label derived here was "- revision", not
// "revision". stripLeadingListPunctuation is the same pattern the pin rule
// tests against, exported from classify.mjs rather than kept as a second,
// silently-driftable copy.
export function resolveCommand(claim, config = {}) {
  if (claim.command) return claim.command;
  const selfAnswering = claim.text.match(SELF_ANSWERING_RE);
  if (selfAnswering) return selfAnswering[1];
  const label = stripOuterMarkup(stripLeadingListPunctuation(claim.text)).split(/[:`]/)[0].trim().toLowerCase();
  return config.pins?.[label] ?? null;
}

export function verifyPin(claim, { runCommand, config }) {
  // A remediated pin names its command instead of storing a value (Fix 1,
  // 2026-08-14 review). There is no stored value left to drift, so this is
  // not a comparison -- it is a pass by construction. The command still
  // runs, so a broken invocation surfaces as BLOCKED rather than a free
  // pass on a command that no longer works.
  if (!claim.command) {
    const selfAnswering = claim.text.match(SELF_ANSWERING_RE);
    if (selfAnswering) {
      try {
        runCommand(selfAnswering[1]);
      } catch (e) {
        return { blocked: `command failed: ${e.message}` };
      }
      return {
        ok: true,
        evidence: 'self-answering: names the command instead of a value, so it cannot go stale',
      };
    }
  }

  const command = resolveCommand(claim, config);
  if (!command) {
    return { blocked: 'no command for this pin; remediate it or add one to config.pins' };
  }
  const expected = pinValue(claim.text);
  if (expected === null) return { blocked: 'could not read a value out of this pin' };
  let observed;
  try {
    observed = String(runCommand(command)).trim();
  } catch (e) {
    return { blocked: `command failed: ${e.message}` };
  }
  return observed === expected
    ? { ok: true, evidence: `${expected} (confirmed)` }
    : { ok: false, evidence: `runbook says ${expected}, system says ${observed}` };
}

export function verifyStatus(claim, { httpProbe }) {
  // Controller correction: nothing in the pipeline populates `url` yet.
  // Without this guard a missing url would reach the probe as undefined.
  // BLOCKED (cannot check) is not the same outcome as FAIL (checked and
  // false) -- mirrors verifyPin's missing-command guard above.
  if (!claim.url) return { blocked: 'no url for this status assertion' };
  const expected = expectedCode(claim.text);
  if (expected === null) return { blocked: 'no status code named in this claim' };
  let observed;
  try {
    observed = httpProbe(claim.url);
  } catch (e) {
    return { blocked: `probe failed: ${e.message}` };
  }
  return observed === expected
    ? { ok: true, evidence: `${claim.url} -> ${observed}` }
    : { ok: false, evidence: `${claim.url} -> ${observed}, runbook says ${expected}` };
}

// IMPLEMENTED AND NOT YET WIRED. No production caller as of 0.2.1: the walk has no
// write-route enumeration to feed it, which is the missing half rather than
// this one. Kept because it is a spec-named capability with a technique behind
// it that found a real defect on STAR, and re-deriving it later would be the
// expensive part. Do not read it as a live path.
//
// Send a request that will fail validation, against a resource that does not
// exist. The guard can only be observed by attempting the thing it prevents,
// and this is the only way found to do that without risking the write.
export function probeWriteGuard(route, { post }) {
  let observed;
  try {
    observed = post(route.path, {});
  } catch (e) {
    return { blocked: `probe failed: ${e.message}` };
  }
  if (observed === route.expected) return { ok: true, evidence: `${route.path} -> ${observed}` };
  if (VALIDATION_CODES.has(observed)) {
    return {
      ok: false,
      evidence: `${route.path} -> ${observed}: the body was validated before auth ran, so an anonymous caller learns the request schema. Nothing was written.`,
    };
  }
  return { ok: false, evidence: `${route.path} -> ${observed}, runbook says ${route.expected}` };
}

// IMPLEMENTED AND NOT YET WIRED. No production caller as of 0.2.1 -- the report's
// coverage fraction is computed from the claim list directly. This is the
// shape the enumeration half will take when a contract source is read; it is
// not a live path today.
//
// Enumeration is mechanical. The total travels with the items so a report can
// never quietly describe a sample as if it were the whole surface.
export function enumerated(list) {
  return { items: [...list], total: list.length };
}
