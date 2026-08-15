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

export function compose({ facts, gaps }) {
  // A repo's own remote is not a service base -- git.mjs legitimately emits
  // a base-url fact for any https-shaped remote, and without this exclusion
  // fact order silently decides whether the health check targets the app or
  // GitHub (review, Fix 2). It stays a fact elsewhere (the header can still
  // name the remote); it is just never a health-URL candidate.
  const baseUrl = pick(facts, 'base-url')
    .filter((f) => f.source !== 'git')
    .find((f) => /^https?:/.test(f.value))?.value ?? '';

  const build = (id) => {
    const drafts = [];

    if (id === 'header') {
      for (const f of pick(facts, 'head-command')) {
        drafts.push({
          text: `HEAD — run: \`${f.value}\``,
          kind: 'pin',
          verify: { type: 'pin', command: f.value },
        });
      }
      for (const f of pick(facts, 'revision-command')) {
        drafts.push({
          text: `revision — run: \`${f.value}\``,
          kind: 'pin',
          verify: { type: 'pin', command: f.value },
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

    if (id === 'health') {
      for (const f of pick(facts, 'health-path')) {
        // An absolute path is already a full URL -- joining it onto a base
        // doubles it into something unreachable. A relative path with no
        // base to join against is not checkable either; rather than draft a
        // status assertion nobody can answer, skip it and let the
        // section-level stub below carry the question (review, Fix 4).
        const isAbsolute = /^https?:/.test(f.value);
        const url = isAbsolute ? f.value : baseUrl ? `${baseUrl.replace(/\/$/, '')}${f.value}` : null;
        if (!url) continue;
        drafts.push({
          text: `**Right:** \`${f.value}\` answers 200.`,
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
