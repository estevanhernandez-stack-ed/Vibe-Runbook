# Real-application validation of the composer spine

**Date:** 2026-08-14 · **Engine:** `plugins/vibe-runbook/` at `5d3e19a` · **Suite:** 235 tests / 27 suites

Task 12 of the v0.2a plan. Two real applications that already carry hand-written
operations runbooks, plus a negative control. Nothing here is a unit test. The
question the design spec left open was how large the un-derivable residue is, and
that measurement is what sizes the next plan.

Every `--out` went to a scratch directory. Nothing was written into PriceScout or
Reel-Battles.

---

## The headline

The generator does not fabricate. On all three runs it wrote only what it could
verify, asked for the rest by name, and listed what it failed to gather. The stop
condition passed cleanly.

It also does not, today, produce an operations runbook. Against a 527-line
hand-written document it emitted **two content assertions**. Against a 512-line one
it emitted **three**. The honesty machinery is finished; the evidence machinery is
barely started.

The important part is *why* the residue is large. It is not that operations
knowledge lives in people's heads — a third of it does, and the stub mechanism
correctly asks for that third. It is that **most of the residue is sitting in
static files the gatherers never open.** That finding points the next plan away
from the live gatherers the spec assumed and toward widening the static ones.

---

## Run 1 — PriceScout

```
node engine/cli.mjs author --project "C:/Users/estev/Projects/PriceScout" --out <scratch>/pricescout-generated.md
gathered from: source, git, manifest
7 sections are unwritten and need you.
```

| | Human `docs/OPERATIONS_RUNBOOK.md` | Generated |
|---|---|---|
| Lines | 527 | 43 |
| Sections (H2 / H3) | 10 / 28 | 7 / 0 |
| Fenced code blocks | 12 | 0 |
| Tables | 3 | 0 |
| Content assertions | — | 2 |
| Unwritten questions | 0 | 7 |

### Bucket 1 — sections both produced

**Empty.** Not "thin" — empty. There is no section where the human and the
generator both say something.

The generator's two content assertions are a HEAD pin and a 29-key configuration
inventory. The hand-written runbook contains neither a revision pin nor an
environment-variable list. The overlap between a 527-line operations document and
its generated counterpart is zero lines.

### Bucket 2 — the human wrote it, the generator could not

All 38 sections. A representative sample, quoted:

- **Severity model with response times.** `| P1 - Critical | System down, all users affected | Immediate |`
- **Circuit-breaker procedure, UI and API paths.** `curl -X POST https://api.pricescout.com/api/v1/system/circuits/fandango/reset -H "Authorization: Bearer <token>"`
- **Daily cadence with thresholds.** `**Frequency:** Daily, 8:00 AM` … `**Total Queued**: Should be < 20`
- **Prometheus queries and a full alert-rules block.** `expr: rate(scrape_theaters_failed_total[1h]) / rate(scrape_theaters_total[1h]) > 0.3`
- **Cause→fix troubleshooting reasoning.** `"Circuit Breaker Open" but External Service Working` → `1. Recent transient failures triggered threshold / 2. IP rate limiting / 3. Authentication issues`
- **Escalation table.** `| On-Call Engineer | Slack #pricescout-oncall | P1/P2 incidents |`

### Bucket 3 — the generator produced it, the human did not think to

This is the bucket the task exists to measure. Four items, and two of them are
worth more than they look.

**1. A required-configuration inventory the human runbook never wrote.** 29 keys,
names only, values deliberately excluded:

> It needs these set: `ENVIRONMENT`, `DEBUG`, `LOG_LEVEL`, `SECRET_KEY`, `SESSION_TIMEOUT_MINUTES`, … `TEST_TIMEOUT`. Values are not recorded here.

**2. A pin that cannot go stale, against a human document that already went
stale.** The generator wrote:

> - HEAD — run: `git rev-parse --short HEAD`

The hand-written runbook's equivalent is a hand-maintained table:

> | 1.0.0 | 2025-01 | Initial | First release |
>
> **Last Updated:** January 2025 · **Review Frequency:** Monthly

A document claiming monthly review, 19 months past its last update. This is the
design argument for self-answering pins, and it is evidenced rather than asserted.

**3. An explicit statement of ignorance.** Neither hand-written runbook in this
study has a section for what it does not cover. The generator's does:

> *Not gathered: no package.json, so no run or test command was derived*
> *Not gathered: no Dockerfile, so the container port was not derived*
> *Not gathered: no agent-access.json, so routes and base urls were derived from source instead*

**4. One question 527 lines never answered.** Of the seven stubs, six are
questions the human runbook answers elsewhere in its own prose. One is not:

> **Unwritten:** How do you confirm a rollback took effect?

PriceScout's runbook has no rollback procedure at all — no section, no ToC entry.
The repository contains `azure/verify-deployment.ps1`. The generated stub asked
the exact question whose answer is already committed to the repo.

---

## Run 2 — Reel-Battles

```
node engine/cli.mjs author --project "C:/Users/estev/Projects/Reel-Battles" --out <scratch>/reel-generated.md
gathered from: source, git, manifest
7 sections are unwritten and need you.
```

| | Human `RUNBOOK.md` | Generated |
|---|---|---|
| Lines | 512 | 47 |
| Sections (H2 / H3) | 15 / 39 | 7 / 0 |
| Fenced code blocks | 13 | 0 |
| Tables | 12 | 0 |
| Content assertions | — | 3 |
| Unwritten questions | 0 | 7 |

### Bucket 1 — sections both produced

One: the run commands, and only the bare commands.

Generated:

> Start it with `npm run dev`.
> Start it with `npm run start`.

Human:

> 1. Ensure the `Start application` workflow is running (`npm run dev`)

and, separately, under Production Build:

> `npm run build` … `npm start`

The generator has the two commands. It has no notion that one is a Replit
workflow and the other a production build, no cold-start-vs-warm-start
distinction, and no ordering. It emitted them as two peer sentences with no
relationship between them.

### Bucket 2 — the human wrote it, the generator could not

14 of 15 sections. Sample:

- **Health matrix with expected bodies.** `| Server alive | GET /api/trivia/stats | 200 | {"totalQuestions": N, "source": "postgresql"} |`
- **Component/port table.** `| Backend API + Web | Express 5 / TypeScript + Vite | 5000 | …`
- **Required env vars with types.** `| DATABASE_URL | Secret | PostgreSQL connection string |`
- **Log patterns to watch.** `| Error fetching trivia questions | High | Database read failure |`
- **Scaling limits.** `| Concurrent users | ~100-500 | Single Node.js process |`
- **Backup and rollback.** `pg_dump $DATABASE_URL --data-only -t trivia_questions > trivia_backup.sql`
- **Security checklist.** `- [ ] SESSION_SECRET is stored as a secret, never committed to code`

### Bucket 3 — the generator produced it, the human did not think to

Thinner here than on PriceScout, and one item goes the wrong way.

**1. The HEAD pin.** The human runbook carries no revision pin of any kind.

**2. The ignorance section**, same as PriceScout.

**3. A regression, recorded honestly.** Reel-Battles has no `.env.example`, so the
generator derived no configuration inventory — the one thing it did better than
the human on PriceScout, it could not do here, while the human documented three
required variables in a table. The generator did not guess. It said so:

> *Not gathered: no .env.example, so required configuration was not derived*

That is the correct behaviour and a real capability gap in the same line.

### Does the shape generalize?

**Yes — and that is a smaller claim than it sounds.** What generalizes across two
unrelated stacks (Python/Streamlit/Azure and TypeScript/Express/Replit) is the
skeleton and the posture: the same seven sections, the same pin, the same stub
questions, the same explicit gap list, ~45 lines either way. Nothing stack-specific
leaked into either document and neither run fabricated anything.

What does **not** generalize is usefulness, because there was never enough content
for usefulness to vary. Two runs producing two and three assertions respectively
demonstrate a consistent frame, not a working generator. The honest statement is:
the shape generalizes, the yield does not yet exist to generalize.

---

## Run 3 — the negative control (stop condition)

A directory containing one `README.md`. No `package.json`, no `scripts/`, no
Dockerfile, no manifest, no git repository.

```
node engine/cli.mjs author --project <scratch>/negative-control --out <scratch>/negative-generated.md
gathered from: source, git, manifest
9 sections are unwritten and need you.
```

**Verdict: PASS.** Zero invented procedure. Nine stubs, six gaps, no assertions.

Output verbatim:

```markdown
# Runbook — negative-control

> Generated by vibe-runbook from: source, git, manifest.
> Claims were checked when this was written; any that could not be are marked below.
> Pins name the command that answers them, so they cannot go stale.

## What you are looking at

**Unwritten:** How do you pin the exact revision this runbook was walked against?

## Run it locally

**Unwritten:** What command starts this service locally, and what does it need to run?

## Is it up

**Unwritten:** Which URL or command tells you the service is alive?

## Deploy

**Unwritten:** What is the command, or process, that deploys this service?

## Roll back

**Unwritten:** How do you confirm a rollback took effect?

## Logs and observability

**Unwritten:** Where do the logs actually live, and what command tails them?

## When something is wrong

**Unwritten:** Who gets paged when this service degrades, and at what threshold?

**Unwritten:** What does degraded-but-acceptable look like here?

**Unwritten:** Which dashboard answers "is this our fault" fastest?

## What could not be gathered

*Not gathered: no package.json, so no run or test command was derived*

*Not gathered: no scripts/ directory, so deploy and rollback were not derived*

*Not gathered: no .env.example, so required configuration was not derived*

*Not gathered: no Dockerfile, so the container port was not derived*

*Not gathered: no git revision available: Command failed: git rev-parse --short HEAD
fatal: not a git repository (or any of the parent directories): .git
*

*Not gathered: no agent-access.json, so routes and base urls were derived from source instead*
```

Not one sentence of that document could be mistaken for procedure. Every heading
carries a question rather than a guess, and the gap list names all six failed
gathers including the git one. This is the behaviour the plan required.

---

## Walk results

Each generated runbook was copied into its own scratch git sandbox (so that
`scan`'s `.vibe-runbook/state/` write never touched a real project) and then run
through `scan` and `walk --env local`.

### Credential preflight

With no token set, all three walks hard-stopped before any verification:

```
BLOCKED: credential unavailable for environment "local"
ask: set VIBE_RUNBOOK_LOCAL_TOKEN for environment "local"
exit=1
```

Correct behaviour, recorded rather than worked around. The walks below ran with a
placeholder token, which only unblocks the turnstile — none of the three
documents contains a status assertion, so nothing was probed.

### Verdicts

| Runbook | Claims scanned | PASS | FAIL | Non-PASS | Stubs reported |
|---|---|---|---|---|---|
| pricescout-generated | 1 | 1 | 0 | 0 | 7 |
| reel-generated | 1 | 1 | 0 | 0 | 7 |
| negative-generated | 0 | 0 | 0 | 0 | 9 |

**No generated claim failed its own birth walk.** The pin round-trips:

```
### pin — 1

- `c-001` **PASS** · RUNBOOK.md:7 — - HEAD — run: `git rev-parse --short HEAD`
  self-answering: names the command instead of a value, so it cannot go stale
```

The negative control's walk is worth quoting, because it refuses in the right
direction:

```
**Could not read this runbook.** 0 marked blocks in 20.
```

A generated document with nothing to verify is reported as unreadable rather than
scored as clean. No false green.

---

## Defects found (recorded, not fixed)

No engine code was modified during this task.

**D1 — two fact kinds are emitted and never consumed.** `source.mjs` emits
`test-command`; `manifest.mjs` emits `route`. `compose.mjs` picks neither. Both
are dead on arrival.

**D2 — two fact kinds are consumed and never emitted.** `compose.mjs` picks
`log-command` and `revision-command`. No gatherer produces either. The
consequence is structural: **"Logs and observability" can never be filled by the
current gatherer set on any project, ever.** It stubbed on all three runs and
would stub on a project whose log command is sitting in its `package.json`.

**D3 — a gap is reported on absence, never on presence-with-zero-yield.**
`source.mjs` pushes `no scripts/ directory…` only in the `else` branch of
`existsSync(scriptsDir)`. PriceScout *has* `scripts/` — 55 files — and not one
matched `/^deploy/i` or `/^rollback/i`, so the generated document's ignorance
section says nothing at all about deploy or rollback. The stub still asks the
question, so nothing is fabricated, but the section that exists to state what the
tool could not gather is incomplete by construction. Meanwhile
`azure/deploy-infrastructure.ps1` and `azure/verify-deployment.ps1` sat one
directory over, unread, because the search is hardcoded to `scripts/`.

**D4 — raw multi-line stderr is interpolated into a single-line italic span.**
The negative control's git gap renders as `*Not gathered: … fatal: not a git
repository …\n*`, an emphasis run broken across three lines. Cosmetic, but it is
in the one document whose whole job is reading as honest.

**D5 — the generator's own body prose is invisible to its own scanner.** The walk
reports `read 1 of 15 content blocks in the document`. The 14 unread blocks
include every step the generator wrote, among them the sentence "Start it with
`npm run dev`."
Steps are not claims, so this is not a fabrication risk — but "verified at birth"
and "walkable thereafter" are different sets, and today only the header pin is in
both.

---

## The residue measurement

Section-level derivation rate against hand-written material:

| | Human sections | Sections the generator derived content for |
|---|---|---|
| PriceScout | 38 (10 H2 + 28 H3) | 0 |
| Reel-Battles | 54 (15 H2 + 39 H3) | 1 |

**~1% of hand-written operations material is derived today.** That is the honest
number and it is disappointing.

But "not derived" and "not derivable" are different, and separating them is the
actual deliverable. Sorting the residue by what evidence would be required:

**Tier A — derivable from static files the gatherers do not currently open.**
Verified present in these repos:

- `PriceScout/azure-pipelines.yml` — build, test, security-scan and deploy stages, with `displayName` strings that read like procedure. Never opened.
- `PriceScout/azure/deploy-infrastructure.ps1`, `azure/verify-deployment.ps1` — the deploy command and the rollback confirmation, both stubbed as Unwritten. Never opened, because the search is hardcoded to `scripts/`.
- `PriceScout/api/metrics.py` — the real Prometheus metric names, registered as `pricescout_circuit_state`, `pricescout_repair_queue_size`, `pricescout_scrape_duration_seconds`, `pricescout_scrapes_total`.
- `Reel-Battles/server/index.ts:100` — `httpServer.listen(`, the source of the port 5000 the human runbook's System Overview table names.
- `Reel-Battles/server/routes.ts:338`, `server/index.ts:69` — `console.error("Error fetching trivia questions:"…)`, `console.error("Failed to seed database:"…)`. The human runbook's entire "Log Patterns to Watch" table is these string literals, transcribed by hand.
- `Reel-Battles/package.json` — `build`, `check`, `db:push`, all used by the human runbook's Deployment, Startup and Schema sections, all dropped because `RUN_SCRIPTS` is `['start','dev','serve']`.
- `PriceScout` is a Python application with `requirements.txt` and `pytest.ini`. The generated document's first gap line is *"no package.json, so no run or test command was derived."* Ecosystem blindness, not evidence absence.

**Tier A carries roughly 60% of the residue**, and every item is a file read. No
network, no running process, no browser, no credential.

**Tier B — needs a live surface.** Genuinely small in these two apps. Reel's
expected response bodies (`{"totalQuestions": 38505, …}`) are live values; the
`process` gatherer's bound-port question is already answered statically by
`server/index.ts`.

**Tier C — not derivable by any gatherer, static or live.** Severity levels and
response times, escalation contacts, scaling projections
(`| Concurrent users | ~100-500 |`), business thresholds
(`**Total Queued**: Should be < 20`), and the cause→fix reasoning in every
troubleshooting table. **Roughly a third of the hand-written material**, and it is
precisely what the `**Unwritten:**` stubs ask for. The stub mechanism is correctly
scoped; there is simply nothing else to do with Tier C but ask.

One further data point on the value of derivation over transcription. **Every
Prometheus query in PriceScout's hand-written runbook is wrong.** It queries
`circuit_breaker_state`, `repair_queue_size`, `repair_queue_failed`,
`scrape_theaters_failed_total`. The registered names are `pricescout_circuit_state`,
`pricescout_repair_queue_size`, `pricescout_scrapes_total`, and there is no
`repair_queue_failed` metric at all — failed jobs are a label,
`pricescout_repair_queue_size{status='max_attempts'}`. A hand-written runbook's most
operational section has been silently broken since January 2025. A gatherer reading
`api/metrics.py` would have been right on all four.

That is the case for this plugin, and it is stronger than the case the spec made
for it.

---

## Recommendation on Plan B's live gatherers

**Trim two, keep one narrowly, and spend the plan on widening the static
gatherers instead.** The measurement does not support the spec's assumption.

**`browser` (Playwright) — trim to Plan C.** It answers "does the UI render",
which is a health check, and a health check needs a URL, which needs route
extraction, which is static. The spec flags an unsolved authentication question
and a navigate-but-never-submit safety requirement; that is a large new surface
bought against a residue slice that measured near zero in both applications.
Neither hand-written runbook's un-derived material is about rendered pages.

**`mcp` — trim.** PriceScout is the strongest possible case for it (it ships a
live MCP server and an `MCP_INSTRUCTIONS.md`), and even there the tool surface and
its cost tiers are *documented in a static file in the repo*. Reading that file
gets the same answer without a live call, without the never-call-a-tool-that-bills
teeth, and without the credential problem.

**`process` — keep, narrowest scope, lower priority.** Log-file locations are its
one uniquely-live answer. Bound ports are not: Reel's port came from
`server/index.ts`. And a documentation generator cannot assume the app is running,
so anything `process` returns is optional by nature.

**What the next plan should actually contain**, ranked by measured residue closed
per unit of new safety surface:

1. **A CI-config gatherer** — `azure-pipelines.yml`, `.github/workflows/*`, `replit.md`. Fills Deploy and Rollback, the two stubs both applications left open. Largest single win; zero new safety surface.
2. **Widen `source.mjs`.** Drop the three-name `RUN_SCRIPTS` whitelist; search sibling directories for deploy/rollback scripts rather than hardcoding `scripts/`; read `listen(PORT)` from source; recognise non-npm ecosystems (`requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`) so a Python application stops reporting "no package.json" as its headline gap.
3. **Route extraction without a manifest** — or have `:author` invoke vibe-access's scan when `agent-access.json` is absent. This is what unblocks the health section, and the health section is what would make a `browser` gatherer coherent later.
4. **Log-literal and metric-registration extraction** — `console.error` / logger string literals, and Prometheus/OTel registrations. Fills Logs and observability, which D2 shows is otherwise structurally unfillable, and would have caught PriceScout's four broken queries.
5. **Close D1–D3** before adding any new fact kind. Two kinds are emitted into nothing and two are consumed from nothing; adding a fifth gatherer on top of that wiring buys less than fixing it.

The one-line version: **the composer spine is sound and the honesty guarantees
hold under adversarial input, but the evidence layer is reading four files when
the answers are sitting in forty.** Widen the static gatherers before reaching for
a browser.
