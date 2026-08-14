---
name: vitals
description: This skill should be used when the user says "/vibe-runbook:vitals" or asks about the health of the local vibe-runbook state. Read-only.
---

# vibe-runbook vitals

Read `<project>/.vibe-runbook/state/claims.json` — the user's project root, not
the plugin directory. Report: whether it exists and its age, the runbook it
points at, claim counts by shape, the last walk's coverage fraction, and any
backups left un-rolled-back (`*.vibe-runbook-<stamp>.bak` beside the files they
back up).

Confirm the engine answers, read-only and with no side effects:

```
cd ${CLAUDE_PLUGIN_ROOT}
node engine/cli.mjs
```

It prints the usage line and exits nonzero. Report the subcommands it lists —
`scan`, `walk`, `remediate` — and flag any that have gone missing from
dispatch.
