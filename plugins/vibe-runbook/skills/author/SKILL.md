---
name: author
description: This skill should be used when the user says "/vibe-runbook:author", "write a runbook for this app", "generate an operations runbook", or wants a runbook created rather than checked. Inspects the app from static evidence, verifies every claim before writing it, and never overwrites an existing runbook.
---

# vibe-runbook author

Load skills/guide/SKILL.md.

Run:

```bash
cd ${CLAUDE_PLUGIN_ROOT}
node engine/cli.mjs author --project <app root>
```

`--out <path>` optionally names the destination; it defaults to
`docs/RUNBOOK.md` under the project root.

1. Report which gatherers ran and which were skipped. A skipped gatherer means a
   thinner runbook, and the user should know which sections got thinner.
2. If a runbook already existed, say so plainly: nothing was overwritten, a
   proposal was written beside it, and the original was backed up. Show the diff
   and let the user merge.
3. Report the unwritten sections by name. These are the questions only the user
   can answer, and they are the most valuable thing in the output — the document
   knows what it does not say.
4. Offer `:walk` as the next move. A generated runbook has already passed its
   own walk at birth; walking it again later is how it stays true.

**Never** fill in an unwritten section by guessing. The stub exists because
nothing could derive the answer, and a plausible invention is worse than a
visible gap.
