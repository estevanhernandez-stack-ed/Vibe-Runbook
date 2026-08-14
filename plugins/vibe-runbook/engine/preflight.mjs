// A green run against the wrong target is worse than no run, because it reads
// as evidence. There is no fallback path here on purpose.
export function preflight({ env, credentialCheck }) {
  if (!env) throw new Error('environment must be named; there is no default');
  const result = credentialCheck();
  if (result.present) return { ok: true, env };
  return {
    ok: false,
    blocked: `credential unavailable for environment "${env}"`,
    ask: result.ask,
  };
}
