# 626 Labs Discord — Runbook

> **Mirror for coverage.** This file lives in two places, kept in sync:
> `626labs-hub/docs/626-discord-runbook.md` (repo-local) and
> `~/Projects/626-DISCORD-RUNBOOK.md` (estate root). Edit both.
> **Design + decisions:** `626labs-hub/docs/superpowers/specs/2026-07-03-626-discord-design.md`.
> **Dashboard decision:** `q2r0jAktCqm2vYNNBU4c` (project 626 Portfolio Hub).

> **⚠ REVISED 2026-07-03 — dedicated server + The Architect.** The plan pivoted from "category in the personal server" to a **dedicated 626 Labs server** run by **The Architect (public surface)** — a persona with real channel controls (scaffold, brand, welcome, moderate, post). The portable release-poster is deferred to a lean sibling. Full pivot + reasoning in the design doc's **Revision** section. The channel layout, poller, and Store-signal design below still hold — those are how the Architect posts releases.

## What this is

626 Labs' Discord: a **dedicated server** — release feed + community + answer-once-help-many support — run by **The Architect** bot personality with channel + moderation controls. Plus a lean, installable release-poster sibling for other servers, later.

- **Part A — dedicated server scaffold + The Architect** (ships first; this runbook).
- **Part B — lean installable release-poster sibling** (its own spec + repo, later).

## Status (2026-07-03)

- [x] Design approved + **revised** (dedicated server + The Architect), spec committed, decisions logged.
- [x] Discord application + bot created by Este; description + tags set (below).
- [x] Discord MCP connected to Claude Code (verified 2026-07-03 — bot `626 Labs#2412`).
- [x] Discord MCP tools live in-session + guild pre-flight check run (2026-07-03, session 2).
- [x] **Dedicated server created + retargeted** (2026-07-03 evening): server **626Labs** (`1522751947130798130`), bot invited with the widened perm list, `DISCORD_GUILD_ID` swapped in the personal-seat config (backup: `.claude.json.bak-discord-retarget`).
- [x] **Part A scaffolded** (2026-07-03 night): 4 channels + #releases lockdown (with bot-role allow overwrite) + builder role + brand icon + server description + 18 emoji + welcome/header/FAQ posted and pinned + bot status. Two live catches: the @everyone send-deny also silences the bot without its own overwrite, and pins need the new **Pin Messages** permission (gotcha 6).
- [ ] The Architect persona (public surface) instantiated for the bot's behavior.
- [x] **Part B spec'd + built + deployed** (2026-07-04): **6deux6** (renamed Noctis app) live at `estevanhernandez-stack-ed/6deux6` — zero-dep Node, 30/30 tests, hourly Action. First CI run seeded 19 targets and committed state. Spec: `docs/superpowers/specs/2026-07-04-6deux6-release-poster-design.md`; plan: `docs/superpowers/plans/2026-07-04-6deux6-release-poster.md`.
- [x] **Feed debut (2026-07-04, ~03:13 UTC): 13 catch-up GitHub Releases cut across the family** (8 tag-ahead repos + the 5 release-less ones, pre-seeded at previous tags so they'd announce, not seed). 6deux6's burst posted all 13 to #releases — announced=13, failed=0. displayVersion patched for prefixed tags (vibe-sec-v0.9.0) first.
- [ ] Evolve backlog from the shelf survey: unreleased commits sit in vibe-Keystone (+5), vibe-taker (+6), Vibe-Prompt (+3), vibe-insights (+1); dirty working trees in vibe-doc / vibe-insights / Vibe-Prompt / vibe-thesis. Future versions ship the usual way — tag it and CI/skill handles the rest.
- [x] **Pipeline solidified + catalog shipped (2026-07-04):** (1) voice hardened after the question-post incident — `meaningfulNotes()` gate, `isAnnouncement()` validator, `[copy]` CI logging; (2) per-product brand thumbnails on every embed; (3) release rite made permanent both ways — global `/cut-release` skill + reusable `cut-release.yml` workflow in the 6deux6 repo, callers installed in the five ex-offender repos (tag push → real notes, always); (4) **#library forum**: all 21 products posted with full descriptions, links, installs, tagged plugin/app/rororo — the whole catalog readable inside Discord. Maintenance: when site.json product copy changes, The Architect refreshes the matching #library post.

> **⚠ Guild check (2026-07-03, session 2):** `DISCORD_GUILD_ID` still targeted the **personal server** (`It's Just Este's server`, `1188607231466410084`), and `list_guilds` showed the bot in only that guild. The scaffold was correctly deferred. **Resolved same evening:** retarget complete — server **626Labs** (`1522751947130798130`), bot invited, config swapped. Scaffold session still opens with the pre-flight gate: `get_guild_info` must name `626Labs`.

## The bot (identity)

- **App:** the 626 Labs release bot (Discord developer portal). A product surface, not plumbing — subtly branded 626 (cyan/magenta), installable on other servers.
- **Description (≤400 chars, as set):** "The release feed for 626 Labs, brought to where the audience lives. It watches GitHub Releases and Microsoft Store drops across the whole 626 Labs surface — native apps, Claude Code plugins, RoRoRo plugins — and posts a clean, branded announcement the second something ships. Config-driven: point it at your own repos and it runs the same feed for your server. Imagine Something Else."
- **Tags:** Releases · Notifications · Developer Tools · Automation · Gaming.
- **Token:** server-admin-level credential. **Never commit it.** User-scope config or OS keychain only — this estate has shipped live creds via `.mcp.json` more than once.

## Part A — server scaffold

### Prerequisites (human-only)

1. Discord application + bot created. *(done)*
2. Invite the bot to the **dedicated server** with these permissions:
   Manage Channels, Manage Roles, **Manage Server**, **Manage Expressions**,
   **Manage Messages**, Send Messages, Embed Links, Read Message History.
   *(The three bolded were added 2026-07-03: the revised Part A sets the server icon — Manage Server; uploads the emoji set — Manage Expressions; pins the welcome/FAQ — Manage Messages. Still no Kick/Ban/Moderate/Administrator — grant those only when the moderation job starts.)*
3. Enable gateway intents (dev portal → Bot): **Server Members** + **Message Content**. Required for the MCP to boot; more than a poster-bot needs, fine for a personal bot.

### Connect the Discord MCP (Claude Code, user scope) — VERIFIED 2026-07-03

- **Get the server (guild) ID:** Discord → User Settings → Advanced → **Developer Mode** on → right-click the server icon → **Copy Server ID**.
- **Add at user scope with `add-json`** (keeps the token out of the repo). Use the JSON form — the `claude mcp add ... -e ... -- npx ...` flag form mis-parses `npx`'s `-y` in PowerShell:

  ```powershell
  claude mcp add-json -s user discord '{"command":"npx","args":["-y","@quadslab.io/discord-mcp"],"env":{"DISCORD_TOKEN":"YOUR_TOKEN","DISCORD_GUILD_ID":"YOUR_ID"}}'
  ```

  - Substitute `YOUR_TOKEN` / `YOUR_ID` inside the JSON — no `<>`, no extra quotes. Keep the single quotes wrapping the JSON (PowerShell passes them literally).
  - **`args` is `["-y","@quadslab.io/discord-mcp"]` with NO `start`.** When launched via config (stdin not a TTY) the server auto-starts; `... start` is for standalone runs only and breaks the MCP mode.
  - Never the project `.mcp.json` — user scope only.
- **Restart Claude Code** and open a fresh session — stdio MCP servers load at startup, so the session where you added it won't see the tools; the next one will. `-y` auto-installs the package on first launch (give it a few seconds).
- **Verify:** `claude mcp get discord` should read connected.

#### Gotchas (the exact order they bit, 2026-07-03)

1. **`claude mcp get` shows "Failed to connect" for any server added mid-session** — it only launches on boot. Restart before diagnosing.
2. **`... check` shows Token/Guild "NOT SET"** when run bare — it reads your *shell* env, not the MCP config's. To validate credentials, feed them in for the one command:
   ```powershell
   $env:DISCORD_TOKEN = Read-Host "token"; $env:DISCORD_GUILD_ID = Read-Host "server id"; npx -y "@quadslab.io/discord-mcp" check
   ```
3. **`✖ Connection failed: Used disallowed intents`** = the #1 real blocker. Dev portal → Bot → **Privileged Gateway Intents** → enable **Server Members** + **Message Content** → **Save Changes**. (Save is easy to miss.)
4. **`check` reporting "14 permissions missing / 42%"** is fine — that grades against the MCP's full 24-perm toolset (Kick/Ban/Manage Server/…). The revised Part A perm list (prerequisite 2 above) is what the invite actually needs. Don't re-invite for the rest unless a later step needs it.
5. **The guild ID is a build-target, not just a credential.** Run `get_guild_info` / `list_guilds` before scaffolding anything — on 2026-07-03 the config still pointed at the personal server, and the pre-flight check was the only thing between the scaffold and the wrong server.
6. **Pins need the dedicated Pin Messages permission** — Discord split it out of Manage Messages (2025), and classic invite bitmasks don't carry it. Symptom: sends/embeds/emoji all work, every pin bounces "Missing Permissions" while the role visibly holds ManageMessages. Fix: Server Settings → Roles → bot role → enable **Pin Messages**. (Caught live 2026-07-03.)
7. **A read-only channel silences the bot too.** The @everyone deny on Send Messages strips the bot unless its role gets its own channel allow overwrite. Set the bot-role allow in the same breath as the lockdown.
8. **The MCP's write tools cache the world at boot.** Channels, roles, and members created after the MCP process starts are invisible to mutating tools (set_channel_permissions, send_message to a new channel) even though `list_*` tools fetch fresh and see them. Fix: restart Claude Code, or do the one mutation in the Discord UI.

### Retarget to the dedicated server (do this before any scaffold)

Found 2026-07-03 (session 2): the MCP config still points at the personal server. Steps, in order:

1. **Este:** create the empty dedicated 626 Labs server (a bot cannot create a server — Discord user only).
2. **Este:** invite `626 Labs#2412` to it via the dev portal OAuth2 URL generator, with the widened permission list above.
3. **Este:** copy the new server ID (Developer Mode → right-click server icon → Copy Server ID).
4. Update the user-scope MCP config — remove, then re-add with the same token and the NEW guild id:

   ```powershell
   claude mcp remove -s user discord
   claude mcp add-json -s user discord '{"command":"npx","args":["-y","@quadslab.io/discord-mcp"],"env":{"DISCORD_TOKEN":"YOUR_TOKEN","DISCORD_GUILD_ID":"NEW_SERVER_ID"}}'
   ```

5. **Restart Claude Code** (stdio MCPs load at boot), then in the fresh session run the pre-flight gate: `get_guild_info` must name the dedicated server and `list_guilds` must show the bot in it. Then execute `docs/626-discord-part-a-payload.md`.

### Scaffold (run via the MCP once tools are live)

> Full staged payload — exact tool sequence, asset→emoji map, welcome/FAQ copy: `docs/626-discord-part-a-payload.md`.

Create category **626 Labs** containing:

| Channel | Purpose | Access |
|---|---|---|
| `#releases` | The bot's release feed | Read-only for `@everyone` (deny Send Messages); bot posts |
| `#general` | Community + product chat | Open |
| `#support` | Help + FAQ; cuts DM load | Open; pin the FAQ |
| `#ideas` | Feature requests | Open |

- **Roles:** the bot role (perms above); optional `@builder` self-assign role. No deep hierarchy — lean even on the dedicated server.
- **Onboarding:** pin a welcome in `#general` (what 626 Labs is, the channel guide, links to 626labs.dev + the Microsoft Store). One-line header in `#releases`.
- **`#support` FAQ seed (pin):** the CAPTCHA-is-normal explainer; "update RoRoRo to 1.8 first"; install-a-plugin-from-URL steps (Plugins → Install → paste release URL → walk the consent sheet).

## Part B — release bot (next project)

**Identity (locked 2026-07-04): Noctis** — Este's existing Discord application
(ID `1475660206099927164`, created 2026-02-24, originally a local-LLM
experiment; its old bot role still sits in the personal server). Reused as the
lean poster so The Architect's broad-perm token stays home. Minimal-perm invite
URL (View Channel + Send Messages + Embed Links + Read Message History only):
`https://discord.com/oauth2/authorize?client_id=1475660206099927164&scope=bot&permissions=84992`
— don't invite anywhere until the poster code exists. Public key not needed (no
interaction webhooks for a poller). Bot token: user-scope config / keychain at
deploy time, never chat, never a repo.

Own repo, Node scheduled poller, ~hourly. **Two sources → `#releases`:**

- **GitHub Releases API** — a config list of repos: the Claude plugins (Vibe family) + the RoRoRo plugins (`rororo-ur-task`, `Ur-OCR`, `rororo-ur-afk`) + any GitHub-releasing app (RORORO).
- **Hub Store data** — `626labs-hub/content/site.json` (products with `storeUrl`) + `content/facts-supplement.json` (Store release count) for the 6 Microsoft Store apps, which never hit GitHub Releases.
- **Store-signal upgrade (verified 2026-07-04):** the Microsoft Store display catalog is a real programmatic version source — `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=<ProductId>&market=US&languages=en-us`, unauthenticated, returns `PackageFullName`s with exact versions (pulled all 6 apps in one pass: RORORO 1.8.0.0, Sanduhr 3.1.0.0, …). Product IDs come from each product's `storeUrl` in site.json. The Part B spec should weigh polling this directly vs hub-data-driven (or use it as the poller with hub data as the human-verified cross-check). Note: site.json carries NO per-app version fields — the hub was never a per-version source; the count in facts-supplement is its only Store fact.

Diffs against last-seen state (idempotent, no double-posts). Posts branded embeds: product, version, family tag (`plugin`/`rororo`/`store`), notes excerpt, link, 626 cyan/magenta, sparing emoji. Config-driven watch-list → channel for installability. Deployable as a scheduled Firebase Function (`guestbuzz-cineperks`) or a GitHub Action in its own repo. **Gets its own spec + implementation plan** — see the design doc's "Part B" and "Open items" (plugin repo watch-list, Function-vs-Action host, embed formatting).

## Reference

- **Design/decisions:** `626labs-hub/docs/superpowers/specs/2026-07-03-626-discord-design.md`.
- **MCP:** [HardHeadHackerHead/discord-mcp](https://github.com/HardHeadHackerHead/discord-mcp) (npm `@quadslab.io/discord-mcp`); alt [EL4CTEO/discord-mcp](https://github.com/EL4CTEO/discord-mcp).
- **Emoji policy:** on-site none; X sparing; **Discord welcome** (its own register).
- **Store cadence:** Microsoft Store / .exe drops don't appear in GitHub Releases — the hub Store data is the source of truth for those.
