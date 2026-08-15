import { emitRunbook } from '../engine/emit.mjs';
import { findStubs } from '../engine/stubs.mjs';
import { extractClaims } from '../engine/extract.mjs';
import { classifyShape } from '../engine/classify.mjs';

const sections = [
  { id: 'header', title: 'What you are looking at', notes: ['no Dockerfile, so the container port was not derived'], stubs: [],
    drafts: [{ text: 'HEAD — run: `git rev-parse --short HEAD`', kind: 'pin', verify: { type: 'pin' }, verdict: 'PASS', evidence: 'self-answering' }] },
  { id: 'health', title: 'Is it up', notes: [], stubs: [],
    drafts: [{ text: '**Right:** `/api/health` answers 200.', kind: 'status-assertion', verify: { type: 'status' }, verdict: 'PASS', evidence: '200' }] },
  { id: 'incident', title: 'When something is wrong', notes: [], stubs: ['Who gets paged, and at what threshold?'], drafts: [] },
];

const md = () => emitRunbook({ appName: 'demo-app', sections, generatedFrom: ['source', 'git'] });

test('emits the app name and which gatherers produced it', () => {
  const out = md();
  expect(out).toContain('demo-app');
  expect(out).toMatch(/source/);
  expect(out).toMatch(/git/);
});

test('an unwritten section emits a stub the scanner can find', () => {
  const stubs = findStubs(md());
  expect(stubs).toHaveLength(1);
  expect(stubs[0].question).toMatch(/Who gets paged/);
});

test('the emitted pin is a command and classifies as a pin when read back', () => {
  const { claims } = extractClaims(md(), 'RUNBOOK.md');
  const pin = claims.find((c) => /rev-parse/.test(c.text));
  expect(pin).toBeDefined();
  expect(classifyShape(pin.text).shape).toBe('pin');
});

test('gathering gaps are stated in the document, not dropped', () => {
  expect(md()).toMatch(/no Dockerfile/);
});

test('emitting is deterministic', () => {
  expect(md()).toBe(md());
});
