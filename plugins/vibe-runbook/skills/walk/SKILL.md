---
name: walk
description: This skill should be used when the user says "/vibe-runbook:walk", "walk my runbook", "is my runbook still true", or wants a runbook verified against a running system. Read-only on the target and never spends.
---

# vibe-runbook walk

Load skills/guide/SKILL.md. Requires a cached scan.

Run the engine. Do not perform the walk by hand — the credential preflight, the
cost gate, the shape gate and the coverage fractions all live in the engine,
and a hand-performed walk is exactly the silently-sampled green report this
plugin exists to catch.

```
cd ${CLAUDE_PLUGIN_ROOT}
node engine/cli.mjs walk --env <environment name> --project <path to the user's project>
```

`--project` roots the claims cache, `.vibe-runbook/config.json`, and the
working directory every pin command runs in. It defaults to the working
directory, which here is the installed plugin, so omitting it walks the wrong
tree. `--env` has no default and never will.

What the engine does, and what you are responsible for reading back:

1. **Preflight first.** It reads `VIBE_RUNBOOK_<ENV>_TOKEN` and hard-stops if
   it is missing, printing the exact ask. Never substitute a different
   environment and never invent a token. The same credential is sent as the
   probe's `Authorization: Bearer` header, so a walk without it would report
   401s as failures against a runbook telling the truth.
2. Enumerate the target surface from the contract source, exhaustively.
3. Verify pins and status assertions only.
4. Assign verdicts. Receipts become QUESTION, humans become HUMAN, anything
   that would cost money becomes SPENDS and is not run.
5. Render the report. It states both coverage fractions, lists every claim
   under its shape with the evidence behind its verdict, names what a full walk
   would have cost, and offers both exits.

Read the report back to the user. When it lists claims under **Needs your input
to check**, offer to add the named keys to `<project>/.vibe-runbook/config.json`
— `config.pins` for a pin's command, `config.urls` for a status assertion's url
— and walk again. When it names an available remediation, offer
`/vibe-runbook:remediate`; never fire it yourself.
