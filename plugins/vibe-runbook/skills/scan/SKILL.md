---
name: scan
description: This skill should be used when the user says "/vibe-runbook:scan", "inventory my runbook", "what claims are in this doc", or wants a runbook's claims classified. Runs the engine scan; writes .vibe-runbook/state/claims.json. Read-only.
---

# vibe-runbook scan

Load skills/guide/SKILL.md.

1. Run the engine. Read-only on the runbook.

   ```
   cd ${CLAUDE_PLUGIN_ROOT}
   node engine/cli.mjs scan --runbook <path to the runbook> --project <path to the user's project>
   ```

   `--project` is not optional in practice. It defaults to the working
   directory, and the working directory here is the installed plugin — omit it
   and the user's claims cache lands inside the plugin instead of their repo.
   A relative `--runbook` resolves against `--project`.

   State is written to `<project>/.vibe-runbook/state/claims.json`.
2. If `coverage.confidence` is `low`, do not proceed to walk. Show the guidance
   verbatim and offer to add markers to the runbook. An unreadable runbook is a
   reportable state, not a failure.
3. Report claims by shape, and name how many are receipts so the user sees what
   will deliberately never be walked.
