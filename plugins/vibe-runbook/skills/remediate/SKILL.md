---
name: remediate
description: This skill should be used when the user says "/vibe-runbook:remediate", "fix my stale pins", or accepts the remediation the walk report offered. Mutating and opt-in; backs up every file before writing.
---

# vibe-runbook remediate

Load skills/guide/SKILL.md. Requires a completed walk.

1. For every FAILed pin, pick the template by venue. Executable venue takes
   `value-to-command`; static venue takes `name-not-count`.
2. Never invent the context. A `value-to-command` rewrite needs the actual
   command, and a `name-not-count` rewrite needs the actual members. If you do
   not have them, say so and stop.
3. Show every diff before writing. Back up each file first.
4. Report the backup paths so a rollback is one step.
