import { determineVenue } from '../engine/venue.mjs';

test('a repo doc is executable venue', () => {
  expect(determineVenue('docs/smoke-2026-08-12.md')).toBe('executable');
  expect(determineVenue('RUNBOOK.md')).toBe('executable');
});

test('served descriptions and instructions are static venue', () => {
  expect(determineVenue('star/mcp/tools.py')).toBe('static');
  expect(determineVenue('engine/instructions.json')).toBe('static');
});
