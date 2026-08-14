---
name: router
description: This skill should be used when the user says "/vibe-runbook" bare, or asks "what's next for my runbook". State-aware next-move recommender. Never auto-fires a mutating step.
---

# vibe-runbook router

Load skills/guide/SKILL.md. Read `.vibe-runbook/state/` and recommend:

- No claims cached → `:scan`
- Claims cached, low confidence → offer markup guidance, not a walk
- Claims cached, no walk → `:walk`, and ask which environment
- Walk done with FAILed pins → name the remediation available and offer
  `:remediate`
- Walk done, clean → say so, and name what was deliberately not walked

Never fire `:remediate` on your own.
