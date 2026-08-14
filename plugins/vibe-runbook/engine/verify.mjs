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

// Where a pin's command comes from, in order:
//   1. The pin itself, if it has already been remediated. A value-to-command
//      rewrite leaves the invocation in backticks, which makes a remediated
//      runbook self-verifying -- the fix for staleness is also what makes the
//      claim checkable next time.
//   2. .vibe-runbook/config.json, keyed by the pin's label.
//   3. Nothing, which is BLOCKED and points at the remediation.
export function resolveCommand(claim, config = {}) {
  if (claim.command) return claim.command;
  const inline = claim.text.match(/`([^`]*\s[^`]*)`/);
  if (inline) return inline[1];
  const label = claim.text.split(/[:`]/)[0].trim().toLowerCase();
  return config.pins?.[label] ?? null;
}

export function verifyPin(claim, { runCommand, config }) {
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

// Enumeration is mechanical. The total travels with the items so a report can
// never quietly describe a sample as if it were the whole surface.
export function enumerated(list) {
  return { items: [...list], total: list.length };
}
