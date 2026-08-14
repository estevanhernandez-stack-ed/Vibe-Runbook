export const SECTIONS = Object.freeze([
  { id: 'header', title: 'What you are looking at' },
  { id: 'run', title: 'Run it locally' },
  { id: 'health', title: 'Is it up' },
  { id: 'deploy', title: 'Deploy' },
  { id: 'rollback', title: 'Roll back' },
  { id: 'observability', title: 'Logs and observability' },
  { id: 'incident', title: 'When something is wrong' },
]);

// Questions for sections nothing can derive. Each is a real question rather
// than a placeholder, because the stub IS the ask.
const STUB_QUESTIONS = {
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
  const baseUrl = pick(facts, 'base-url').find((f) => /^https?:/.test(f.value))?.value ?? '';

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
        const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}${f.value}` : f.value;
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
  // Every gap is stated somewhere in the document. A gatherer that could not
  // run is a limitation the reader must see, not an omission.
  if (gaps.length > 0) sections[0].notes.push(...gaps);
  return sections;
}
