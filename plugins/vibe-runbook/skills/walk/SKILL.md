---
name: walk
description: This skill should be used when the user says "/vibe-runbook:walk", "walk my runbook", "is my runbook still true", or wants a runbook verified against a running system. Read-only on the target and never spends.
---

# vibe-runbook walk

Load skills/guide/SKILL.md. Requires a cached scan.

1. **Preflight first.** Confirm the credential for the named environment. If it
   is missing, stop and report BLOCKED with the exact ask. Never substitute a
   different environment.
2. Enumerate the target surface from the contract source, exhaustively.
3. Verify pins and status assertions only.
4. Assign verdicts. Receipts become QUESTION, humans become HUMAN, anything that
   would cost money becomes SPENDS and is not run.
5. Render the report. It must state coverage as a fraction, name what a full
   walk would have cost, and offer both exits.
