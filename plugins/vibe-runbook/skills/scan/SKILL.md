---
name: scan
description: This skill should be used when the user says "/vibe-runbook:scan", "inventory my runbook", "what claims are in this doc", or wants a runbook's claims classified. Runs the engine scan; writes .vibe-runbook/state/claims.json. Read-only.
---

# vibe-runbook scan

Load skills/guide/SKILL.md.

1. Run `node engine/cli.mjs scan --runbook <path>`.
2. If `coverage.confidence` is `low`, do not proceed to walk. Show the guidance
   verbatim and offer to add markers to the runbook. An unreadable runbook is a
   reportable state, not a failure.
3. Report claims by shape, and name how many are receipts so the user sees what
   will deliberately never be walked.
