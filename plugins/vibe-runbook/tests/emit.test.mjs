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

// Review fixes, 2026-08-14 (coordinator round). All three are reachable
// today, not hypothetically -- see engine/emit.mjs's fix comments for why.

test('a BLOCKED header pin states its evidence on the page, and its bullet still classifies as a pin', () => {
  const blockedSections = [
    {
      id: 'header', title: 'What you are looking at', notes: [], stubs: [],
      drafts: [
        { text: 'HEAD — run: `git rev-parse --short HEAD`', kind: 'pin', verify: { type: 'pin' }, verdict: 'PASS', evidence: 'self-answering' },
        { text: 'revision — run: `gcloud run services describe demo-app`', kind: 'pin', verify: { type: 'pin' }, verdict: 'BLOCKED', evidence: 'command failed: gcloud not found' },
      ],
    },
  ];
  const out = emitRunbook({ appName: 'demo-app', sections: blockedSections, generatedFrom: ['source'] });

  // The intro claims "every claim below was verified at the moment it was
  // written" -- a BLOCKED pin makes that false unless the page says so.
  expect(out).toMatch(/could not be verified at generation time/);
  expect(out).toMatch(/command failed: gcloud not found/);

  const { claims } = extractClaims(out, 'RUNBOOK.md');
  const revisionPin = claims.find((c) => /describe demo-app/.test(c.text));
  expect(revisionPin).toBeDefined();
  expect(classifyShape(revisionPin.text).shape).toBe('pin');
});

test('two header pins extract as two distinct claims, each carrying only its own command', () => {
  const twoPinSections = [
    {
      id: 'header', title: 'What you are looking at', notes: [], stubs: [],
      drafts: [
        { text: 'HEAD — run: `git rev-parse --short HEAD`', kind: 'pin', verify: { type: 'pin' }, verdict: 'PASS', evidence: 'self-answering' },
        { text: 'revision — run: `gcloud run services describe demo-app`', kind: 'pin', verify: { type: 'pin' }, verdict: 'PASS', evidence: 'self-answering' },
      ],
    },
  ];
  const out = emitRunbook({ appName: 'demo-app', sections: twoPinSections, generatedFrom: ['source'] });

  const { claims } = extractClaims(out, 'RUNBOOK.md');
  const pinClaims = claims.filter((c) => classifyShape(c.text).shape === 'pin');
  expect(pinClaims).toHaveLength(2);
  const headClaim = pinClaims.find((c) => /rev-parse/.test(c.text));
  const revisionClaim = pinClaims.find((c) => /describe demo-app/.test(c.text));
  expect(headClaim).toBeDefined();
  expect(revisionClaim).toBeDefined();
  // Each claim carries only its own command, not the neighbor's.
  expect(headClaim.text).not.toMatch(/describe demo-app/);
  expect(revisionClaim.text).not.toMatch(/rev-parse/);
});

test('a non-PASS draft re-extracts with no verdict comment glued into its claim text', () => {
  const failingSection = [
    {
      id: 'health', title: 'Is it up', notes: [], stubs: [],
      drafts: [{
        text: '**Right:** `/api/health` answers 200.',
        kind: 'status-assertion',
        verify: { type: 'status' },
        verdict: 'FAIL',
        evidence: '/api/health -> 500, runbook says 200',
      }],
    },
  ];
  const out = emitRunbook({ appName: 'demo-app', sections: failingSection, generatedFrom: ['source'] });

  // The comment is still on the page (visible evidence of the FAIL)...
  expect(out).toMatch(/FAIL at generation/);

  // ...but does not leak into the re-extracted claim's text.
  const { claims } = extractClaims(out, 'RUNBOOK.md');
  const claim = claims.find((c) => /api\/health/.test(c.text));
  expect(claim).toBeDefined();
  expect(claim.text).not.toMatch(/<!--/);
});
