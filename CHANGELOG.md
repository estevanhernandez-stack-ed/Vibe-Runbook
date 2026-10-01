# Changelog

All notable changes to vibe-runbook are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The plugin ships from
`plugins/vibe-runbook/`; `plugin.json` and `package.json` carry the same version.

## [0.2.1] — 2026-10-01

Release hygiene for the first stable promotion (the vibe-plugins stable channel
pinned v0.2.0 on 2026-10-01). No engine behavior change; 268 tests, unchanged.

### Added

- `README.md`. The storefront row and the `plugin.json` homepage previously landed
  on GitHub's "Add a README" placeholder.
- `CHANGELOG.md`.
- `.github/workflows/release.yml`: the family's tag-push release caller, so a
  `v*` tag cuts a GitHub Release with commit-bullet notes.

### Changed

- `tests/fixtures/discord-ops-runbook.md` replaces `626-discord-runbook.md`. Same
  document shape and every marker verbatim; guild ids, the app id and invite URL,
  a dashboard decision id, estate paths and the owner's name are scrubbed. The
  negative-control baseline it pins (9 claims, 1 from a prose marker, high
  confidence) is unchanged.
- Stale "v0.1 ... until v0.2" wording in `evolve-runbook`, `remediate`,
  `engine/datahome.mjs` and `engine/verify.mjs` now says what is true at 0.2.1:
  session logging and write-route enumeration are implemented and not yet wired.

### Removed

- `pure-rand` from `dependencies`. Nothing imported it; the engine has no runtime
  dependencies. Regenerating the lockfile also fixed its own stale version field,
  which still read 0.1.0 under the v0.2.0 tag.

## [0.2.0] — 2026-08-17

First tagged release. The v0.1 build it grew from was never tagged.

- `author`: gather facts from scripts, container, CI, env, git and a vibe-access
  manifest when one exists; verify every draft claim before it reaches the page;
  emit a runbook that reads itself back. `--env` is required before any probe and
  selects the base url by name. Never clobbers an existing `--out`; backs up
  proposals too.
- `scan`, `walk`, `remediate`, `vitals`, the router and `evolve-runbook`, with the
  six verdicts, the venue rule and the two rewrite templates.
- Cost, blast and undo harm sections in the claim taxonomy.
- Report prints each claim, its shape and what was observed, plus a completeness
  line beside the coverage fractions; unwritten sections are counted separately
  from claims.
- Prose expectation markers recognized inside list items and table rows; an
  unterminated fence forces low confidence instead of silence.
- Real-application validation of the composer spine
  (`docs/validation-2026-08-13.md`).
