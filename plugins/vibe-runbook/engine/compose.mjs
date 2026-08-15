export const SECTIONS = Object.freeze([
  { id: 'header', title: 'What you are looking at' },
  { id: 'run', title: 'Run it locally' },
  { id: 'health', title: 'Is it up' },
  { id: 'deploy', title: 'Deploy' },
  { id: 'rollback', title: 'Roll back' },
  { id: 'observability', title: 'Logs and observability' },
  { id: 'incident', title: 'When something is wrong' },
]);

// Questions for sections nothing can derive. Every SECTIONS id needs an entry
// here -- a section that comes back with zero drafts and no question is
// completely silent, which is the exact failure this plugin exists to
// refuse (review, 2026-08-14, Fix 1). Each is a real question rather than a
// placeholder, because the stub IS the ask.
const STUB_QUESTIONS = {
  header: ['How do you pin the exact revision this runbook was walked against?'],
  run: ['What command starts this service locally, and what does it need to run?'],
  health: ['Which URL or command tells you the service is alive?'],
  deploy: ['What is the command, or process, that deploys this service?'],
  incident: [
    'Who gets paged when this service degrades, and at what threshold?',
    'What does degraded-but-acceptable look like here?',
    'Which dashboard answers "is this our fault" fastest?',
  ],
  observability: ['Where do the logs actually live, and what command tails them?'],
  rollback: ['How do you confirm a rollback took effect?'],
};

const pick = (facts, kind) => facts.filter((f) => f.kind === kind);

// Fix 1 (2026-08-14 whole-branch review), and the reason `env` is now a
// parameter rather than an inference. The base url used to be "the first
// non-git https base-url in fact order", which is file order out of a
// manifest -- so `--env prod` against a manifest listing `local` first sent
// the production bearer token to http://127.0.0.1 over plain HTTP, and no
// `--env` at all probed whatever host happened to be listed first, with no
// credential, and wrote the 200 down as a PASS.
//
// Two rules, both absolute:
//   - No env named, no probe. The health section falls to its stub question,
//     which is the honest outcome and already the outcome on every project
//     without a manifest.
//   - The env NAMES the base url. `--env prod` uses baseUrls.prod and
//     nothing else. A missing key is a stub, never a fallback to another
//     host -- falling back is how a "green" run against the wrong target
//     gets recorded as evidence.
function resolveBaseUrl(facts, env) {
  if (!env) return '';
  // A repo's own remote is not a service base -- git.mjs legitimately emits
  // a base-url fact for any https-shaped remote, and without this exclusion
  // fact order silently decided whether the health check targeted the app or
  // GitHub (review, Fix 2). It stays a fact elsewhere (the header can still
  // name the remote); it is just never a health-URL candidate.
  const named = pick(facts, 'base-url')
    .filter((f) => f.source !== 'git')
    .find((f) => f.key === env);
  return named && /^https?:/.test(named.value) ? named.value : '';
}

// Fix A (CRITICAL, 2026-08-14 re-review). `--env` gated WHETHER a probe
// happened and not WHERE it went. An affordance whose `path` is already a
// full url skipped the base-url join entirely, so a manifest carrying
// `http://127.0.0.1:<local>/api/health` as an absolute path, invoked as
// `--env prod` with a prod token set, sent `Bearer PROD-SECRET-TOKEN` to
// the local host over plain HTTP -- the original C1 outcome verbatim,
// through the one branch the first fix did not cover.
//
// The ruled invariant is "emit the stub rather than falling back to another
// host", and an absolute path that never consults the named host IS another
// host. So an absolute url has to prove it belongs to the environment that
// was named: same origin as that environment's base url, or it does not get
// drafted. Origin rather than a string compare, so a trailing slash or a
// default port does not read as a different host -- and any url that will
// not parse is not a match, because an unparseable url cannot be shown to
// be the named one.
function sameOrigin(a, b) {
  if (!a || !b) return false;
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function compose({ facts, gaps }, { env } = {}) {
  const baseUrl = resolveBaseUrl(facts, env);

  const build = (id) => {
    const drafts = [];

    if (id === 'header') {
      // `verify.command` is deliberately absent (2026-08-14 whole-branch
      // review). author.mjs must not forward a command onto the claim it
      // builds -- doing so pushes verifyPin off its self-answering fast path
      // and into a comparison that can never match. The field existed, was
      // read by nothing, and carried a comment saying not to use it, which
      // is an invitation to wire it back up. The text names the command; that
      // is the whole design.
      for (const f of pick(facts, 'head-command')) {
        drafts.push({
          text: `HEAD — run: \`${f.value}\``,
          kind: 'pin',
          verify: { type: 'pin' },
        });
      }
    }

    if (id === 'run') {
      for (const f of pick(facts, 'run-command')) {
        drafts.push({ text: `Start it with \`${f.value}\`.`, kind: 'step', verify: { type: 'none' } });
      }
      for (const f of pick(facts, 'port')) {
        drafts.push({ text: `It listens on port ${f.value} (${f.source}).`, kind: 'step', verify: { type: 'none' } });
      }
      const keys = pick(facts, 'env-key').map((f) => f.key);
      if (keys.length > 0) {
        drafts.push({
          text: `It needs these set: ${keys.map((k) => `\`${k}\``).join(', ')}. Values are not recorded here.`,
          kind: 'step',
          verify: { type: 'none' },
        });
      }
    }

    // `env` gates the whole section, not just the base-url join: an absolute
    // health-path is a full URL and would otherwise be probed with no
    // environment named and no credential preflight behind it. "No env, no
    // probe" has to mean every probe, or it means nothing.
    if (id === 'health' && env) {
      for (const f of pick(facts, 'health-path')) {
        // Three outcomes, and the two that are not a drafted claim both fall
        // through to the section stub.
        //
        // An absolute path is already a full URL, so joining it onto a base
        // would double it into something unreachable -- it is used as-is,
        // but ONLY once it has proved it points at the environment that was
        // named (sameOrigin above). A different origin is a different host,
        // and reaching one the operator did not name is the whole C1 defect.
        //
        // A relative path with no base to join against is not checkable
        // either; rather than draft a status assertion nobody can answer,
        // skip it and let the section-level stub carry the question
        // (review, Fix 4).
        const isAbsolute = /^https?:/.test(f.value);
        let url = null;
        if (isAbsolute) {
          if (sameOrigin(f.value, baseUrl)) url = f.value;
        } else if (baseUrl) {
          url = `${baseUrl.replace(/\/$/, '')}${f.value}`;
        }
        if (!url) continue;
        // The claim text names the PATH, never the whole url, so both
        // branches emit one claim shape. Found live re-verifying Fix A: an
        // absolute path put its host into the claim text, and verify.mjs's
        // expectedCode reads the first 1xx-5xx-shaped number it finds --
        // which is `127` out of `127.0.0.1`, not the 200 the sentence
        // actually asserts. The generator then wrote its own document a
        // FAIL note reading "runbook says 127". A false FAIL against a
        // runbook telling the truth is the class guide invariant 6 exists
        // to prevent, and emitting one into the document being generated is
        // the worst place to do it. The host is not lost: it is in
        // verify.url and in the config.urls entry the walk resolves.
        const shownPath = isAbsolute ? new URL(url).pathname : f.value;
        drafts.push({
          text: `**Right:** \`${shownPath}\` answers 200.`,
          kind: 'status-assertion',
          verify: { type: 'status', url },
        });
      }
    }

    // Recorded, never executed. Verifying a deploy by deploying is the one
    // thing a documentation tool must not do.
    if (id === 'deploy') {
      for (const f of pick(facts, 'deploy-command')) {
        drafts.push({ text: `Deploy with \`${f.value}\`.`, kind: 'step', verify: { type: 'none' } });
      }
    }
    if (id === 'rollback') {
      for (const f of pick(facts, 'rollback-command')) {
        drafts.push({ text: `Roll back with \`${f.value}\`.`, kind: 'step', verify: { type: 'none' } });
      }
    }

    if (id === 'observability') {
      for (const f of pick(facts, 'log-command')) {
        drafts.push({ text: `Tail logs with \`${f.value}\`.`, kind: 'step', verify: { type: 'none' } });
      }
    }

    const stubs = drafts.length === 0 ? (STUB_QUESTIONS[id] ?? []) : [];
    return { id, title: SECTIONS.find((s) => s.id === id).title, drafts, stubs, notes: [] };
  };

  const sections = SECTIONS.map((s) => build(s.id));
  // Gaps are unstructured strings -- attributing one to a section would mean
  // guessing which section it belongs to, and that guess ripples back
  // through the gatherer contract. So they are not folded into header
  // commentary (where a reader would mistake them for something about "what
  // you are looking at"); they get their own titled place at the end, as a
  // group, so the gathering-side limitations read as a group instead of
  // being scattered or mistaken for prose (review, Fix 3).
  if (gaps.length > 0) {
    sections.push({ id: 'gaps', title: 'What could not be gathered', drafts: [], stubs: [], notes: [...gaps] });
  }
  return sections;
}
