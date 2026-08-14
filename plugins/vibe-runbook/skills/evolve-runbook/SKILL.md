---
name: evolve-runbook
description: This skill should be used when the user says "/vibe-runbook:evolve-runbook" and wants vibe-runbook to reflect on its own past runs and propose improvements to itself. Reads session logs from the resolved data home, writes proposals to docs/proposed-changes.md in the vibe-runbook solo repo. Never auto-applies.
---

# vibe-runbook evolve

Read the session logs under the resolved data home. Weight by what actually
happened, not by what was noisy.

The highest-value signal is **classifier misfires**: any claim where the
recorded `classifierRule` produced a shape the user corrected. Every misfire is
a named rule to fix, which is the entire reason rules are named.

Second: **extraction misses.** Runbooks where confidence came back `low`. Each
one is a house style the marker set does not cover yet.

Write proposals to `docs/proposed-changes.md`. Never edit a SKILL directly.
