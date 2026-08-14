import { dataHome } from '../engine/datahome.mjs';

test('prefers CLAUDE_PLUGIN_DATA when set', () => {
  const prev = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = process.cwd();
  expect(dataHome()).toBe(process.cwd());
  if (prev === undefined) delete process.env.CLAUDE_PLUGIN_DATA; else process.env.CLAUDE_PLUGIN_DATA = prev;
});

test('falls back to the legacy family path', () => {
  const prev = process.env.CLAUDE_PLUGIN_DATA;
  delete process.env.CLAUDE_PLUGIN_DATA;
  expect(dataHome()).toMatch(/plugins[\\/]data[\\/]vibe-runbook$/);
  if (prev !== undefined) process.env.CLAUDE_PLUGIN_DATA = prev;
});
