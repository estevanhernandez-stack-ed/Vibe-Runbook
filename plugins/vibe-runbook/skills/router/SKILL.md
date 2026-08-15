---
name: router
description: This skill should be used when the user says "/vibe-runbook" bare, or asks "what's next for my runbook". State-aware next-move recommender. Never auto-fires a mutating step.
---

# vibe-runbook router

Load skills/guide/SKILL.md. Read `<project>/.vibe-runbook/state/claims.json`,
where `<project>` is the user's project root — never the plugin directory — and
recommend:

- No runbook found under the project root → `:author`. There is nothing to
  check yet, so writing one is the only move that helps.
- No claims cached → `:scan`
- Claims cached, low confidence → offer markup guidance, not a walk
- Claims cached, no walk → `:walk`, and ask which environment
- Walk done with FAILed or BLOCKED pins → name the remediation available and
  offer `:remediate`
- Walk done, clean → say so, and name what was deliberately not walked

Every engine invocation runs from the plugin directory and takes the project as
an argument:

```
cd ${CLAUDE_PLUGIN_ROOT}
node engine/cli.mjs scan      --runbook <path> --project <path>
node engine/cli.mjs walk      --env <name>     --project <path>
node engine/cli.mjs remediate                  --project <path>   # add --apply only on an explicit yes
```

Never fire `:remediate` on your own, and never pass `--apply` on your own.
