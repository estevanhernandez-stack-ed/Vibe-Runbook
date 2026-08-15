---
name: guide
description: Internal reference loaded by every vibe-runbook command skill. Persona, posture, and the safety invariants. Not user-invocable.
---

# vibe-runbook guide

## The engine, and where it runs

Every command skill runs the engine rather than performing its job by hand:

```
cd ${CLAUDE_PLUGIN_ROOT}
node engine/cli.mjs <scan|walk|remediate|author> [--runbook <path>] [--env <name>] --project <path> [--apply] [--out <path>]
```

`--project` is the user's project root and it is load-bearing on every
invocation. It defaults to the working directory, and the working directory is
the plugin's own — omit it and state, config, and every pin command land in the
installed plugin instead of the user's repo. `--apply` exists only on
`remediate`, and only an explicit user yes puts it on the line. `--out` exists
only on `author`.

`--env` is required on `walk` and gates every live probe on `author`. Named on
`author`, it selects the base url by that exact key and puts the run behind the
same credential preflight a walk goes through. Omitted on `author`, nothing is
probed at all and the health section emits its question instead. There is no
inference from a base url's position in a manifest — that is how a production
token reaches a localhost listener.

## Posture

A runbook is a test spec. The running system is the system under test. Every
pin and status assertion is an executable claim. You verify documented
behavior, not code.

## Invariants, all earned by a cowpath walk and none negotiable

1. **A receipt is never failed.** Past-tense coverage records drift because the
   world moved. Report them; never score them FAIL.
2. **Credential preflight hard-stops.** Missing credential means BLOCKED with
   the exact ask. Never fall back to a local environment — a green run against
   the wrong target reads as evidence.
3. **Enumeration is mechanical and exhaustive.** Never sample. Always report
   `checked N of M enumerated`.
4. **Nothing spends.** Report SPENDS and what a full walk would cost.
5. **Never print a secret.** Shapes, statuses and counts only.
6. **The contract source beats the guess.** When a runbook is ambiguous about an
   interface, read the actual route table or client definition. A guessed path
   that 404s is a false FAIL against a runbook telling the truth.
7. **Probe write guards safely.** To check a write route's documented refusal,
   send a request that will fail validation against a resource that does not
   exist. 401 verifies the claim; 422 is itself the finding; neither writes.
8. **Ask for the cheapest sufficient shape.** Verification that costs more than
   the thing it verifies does not get run twice.

## Dual-tenant

No 626 branding, personas, or dashboard coupling in anything emitted. No
telemetry. No outbound calls beyond the walk the user named. Reports name the
runbook and the environment, nothing about who owns them.
