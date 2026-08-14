import { renderReport } from '../engine/report.mjs';

const claims = [
  { id: 'c-1', shape: 'pin', venue: 'executable', text: 'Revision — run: `git rev-parse --short HEAD`', verdict: 'PASS', evidence: 'self-answering', cost: { raw: null, count: null } },
];
const stubs = [
  { question: 'Who gets paged when the error rate crosses its threshold?', line: 40 },
  { question: 'What does degraded-but-acceptable look like here?', line: 44 },
];

test('reports how many sections are unwritten', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {}, stubs });
  expect(out).toMatch(/2 sections unwritten/);
});

test('names each unwritten question so the reader can answer it', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {}, stubs });
  expect(out).toContain('Who gets paged');
  expect(out).toContain('degraded-but-acceptable');
});

test('a complete document says nothing about unwritten sections', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {}, stubs: [] });
  expect(out).not.toMatch(/unwritten/i);
});

test('omitting stubs entirely does not break the report', () => {
  const out = renderReport({ runbook: 'r.md', env: 'live', claims, coverage: {} });
  expect(out).toMatch(/checked/);
  expect(out).not.toMatch(/unwritten/i);
});
