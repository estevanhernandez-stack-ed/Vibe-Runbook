---
name: vitals
description: This skill should be used when the user says "/vibe-runbook:vitals" or asks about the health of the local vibe-runbook state. Read-only.
---

# vibe-runbook vitals

Report: whether `.vibe-runbook/state/claims.json` exists and its age, the
runbook it points at, claim counts by shape, the last walk's coverage fraction,
and any backups left un-rolled-back.
