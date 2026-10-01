# Vibe Runbook

Your runbook says "do X and you will see W." Nothing checks whether that is still
true. Vibe Runbook reads a runbook, classifies every claim in it, and walks the ones
a machine can walk against an environment you name — read-only, and it never
spends. It can also draft the runbook in the first place, from what a repository
can actually prove about the app, and asks by name for everything it cannot.

## What it does

- **Scan** inventories a runbook's claims and classifies each one by shape: a pin
  (a value that identifies the running system), a status assertion, a past-tense
  receipt, a question. Ambiguity escalates to a question instead of a guess, and
  the extraction reports its own confidence.
- **Walk** checks the machine-checkable claims against a named environment.
  Six verdicts: `PASS`, `FAIL`, `BLOCKED`, `SPENDS`, `HUMAN`, `QUESTION`. A receipt
  is reported and **never failed**, because a document that says it tested 17
  rooms is not lying when there are now 12. Credential preflight hard-stops rather
  than quietly walking your local machine and calling it green. Every report
  states `checked N of M enumerated`.
- **Remediate** rewrites a stale pin as the command that answers it where the
  reader has a shell, or as the list it was summarizing where they do not. Diffs
  by default; `--apply` writes, with a backup beside every file it touches.
- **Author** drafts an operations runbook from what it can derive: a revision pin
  that answers itself, the commands that run the app, the deploy and rollback
  scripts where they exist, the names of the configuration keys it needs. What a
  repository cannot tell you (severity thresholds, escalation, the reasoning behind
  a fix) comes out as explicit questions, and every later walk reports them still
  unanswered. It never overwrites a runbook you wrote; it proposes beside it.

## Install

**Stable — as a Claude Code plugin via the marketplace:**

```text
/plugin marketplace add estevanhernandez-stack-ed/vibe-plugins
/plugin install vibe-runbook@vibe-plugins
```

**Canary — track this repo's `main`:**

```text
/plugin install vibe-runbook@estevanhernandez-stack-ed/Vibe-Runbook
```

## Commands

| Command | Does |
|---|---|
| `/vibe-runbook` (bare) | State-aware router. Reads what exists (a cached scan, a config, a runbook) and recommends one next move. Never walks or writes on its own. |
| `/vibe-runbook:scan` | Inventory a runbook's claims and classify each one. |
| `/vibe-runbook:walk` | Walk a runbook against a named environment. Read-only, never spends. `--env` is required. |
| `/vibe-runbook:remediate` | Rewrite a stale pin as the command that answers it, or the list it summarized. |
| `/vibe-runbook:author` | Inspect an app and write an operations runbook that verifies itself. |
| `/vibe-runbook:vitals` | Health of the local vibe-runbook state. |
| `/vibe-runbook:evolve-runbook` | Reflect on past runs and propose improvements to this plugin. Writes proposals; never edits a skill. |

Every command skill runs the engine rather than doing the job by hand:

```text
node engine/cli.mjs <scan|walk|remediate|author> [--runbook <path>] [--env <name>] --project <path> [--apply] [--out <path>]
```

`--project` is the user's project root and is load-bearing on every invocation;
omitted, state and every pin command land in the installed plugin instead of
your repo. `--env` is required on `walk` and gates every live probe on `author`.

## The verdicts

| Verdict | Means |
|---|---|
| `PASS` | The claim was checked and holds. |
| `FAIL` | The claim was checked and does not hold. The report prints the claim, its shape, and what was observed. |
| `BLOCKED` | The check could not run, and the report says exactly what it needs (a credential, a reachable host). |
| `SPENDS` | The check would cost something (an API call that bills, a write). Reported with what a full walk would cost; never run. |
| `HUMAN` | Only a person can verify this. |
| `QUESTION` | The runbook does not say enough to check. Asked, not guessed. |

## The invariants

All earned by a cowpath walk, none negotiable:

1. **A receipt is never failed.** Past-tense coverage records drift because the world moved.
2. **Credential preflight hard-stops.** A missing credential is `BLOCKED` with the exact ask, never a fallback to a local environment.
3. **Enumeration is mechanical and exhaustive.** Never sample. Always `checked N of M enumerated`.
4. **Nothing spends.** Report `SPENDS` and what a full walk would cost.
5. **Never print a secret.** Shapes, statuses and counts only.
6. **The contract source beats the guess.** When the runbook is ambiguous about an interface, read the route table or client definition.
7. **Probe write guards safely.** Send a request that fails validation against a resource that does not exist: 401 verifies the guard, 422 is itself the finding, neither writes.
8. **Ask for the cheapest sufficient shape.** Verification that costs more than the thing it verifies does not get run twice.

## Real-application validation

- **The walker (2026-08-13).** Walked against a live Cloud Run service's hand-written
  smoke list, read-only, zero spend: 5 claims `PASS`, 3 `FAIL`, 8 of 8 numbered
  steps unreachable. Every verifiable claim lived in the preamble, every
  unreachable one in the numbered steps, which is the opposite of what the design
  assumed. The write-guard probe found six routes that answered 422 with the
  missing field name instead of 401, handing the API schema to anonymous callers;
  all were fixed the same day and re-walked. The design record lives in the
  [vibe-plugins spec bank](https://github.com/estevanhernandez-stack-ed/vibe-plugins/tree/main/docs/spec-bank).
- **The author (2026-08-14).** Run against two real applications that already
  carry hand-written operations runbooks, plus a negative control. It fabricated
  nothing: it wrote only what it could verify, asked for the rest by name, and
  listed what it failed to gather. Against a 527-line hand-written document it
  emitted two content assertions; against a 512-line one, three. The honesty
  machinery is finished; the evidence machinery is barely started. Full record:
  [`docs/validation-2026-08-13.md`](docs/validation-2026-08-13.md).

## Known limits

- **Author's un-derivable residue is large.** Most of a real operations runbook is
  not in the repository. Expect questions, not a finished document.
- **Session logging is not wired yet.** The data home is resolved and never written
  to, so `evolve-runbook` has no well to draw from until a release wires it and
  says so in the CHANGELOG.
- **Remediate skips a claim joined across a line wrap** and offers the exact
  `after` line to apply by hand, rather than rewriting the wrap.
- **Write-route enumeration and the invalid-body guard probe are implemented and
  not yet wired** into the walk. They are kept because the technique found a real
  defect on the validation target; they are not a live path today.
- **Role-scoped walkers, walker generation and `HUMAN`-on-re-run are unproven.**

## Data home

State lives centrally, never inside the project it walks: `${CLAUDE_PLUGIN_DATA}`,
else `~/.claude/plugins/data/vibe-runbook/`, else a loud failure rather than a
silent write to the wrong place (`engine/datahome.mjs`).

## Dual-tenant by design

No 626 branding, personas or dashboard coupling in anything emitted. No telemetry.
No outbound calls beyond the walk you named. Reports name the runbook and the
environment, nothing about who owns them.

## Part of the Vibe ecosystem

Part of the **[Vibe Plugins](https://github.com/estevanhernandez-stack-ed/vibe-plugins)**
marketplace from 626 Labs.

```text
/plugin marketplace add estevanhernandez-stack-ed/vibe-plugins
```

## License

MIT
