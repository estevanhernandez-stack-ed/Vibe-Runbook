import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { verifyPin, verifyStatus } from './verify.mjs';
import { assignVerdict } from './verdict.mjs';
import { runGatherers } from './gather/contract.mjs';
import { sourceGatherer } from './gather/source.mjs';
import { gitGatherer } from './gather/git.mjs';
import { manifestGatherer } from './gather/manifest.mjs';
import { compose } from './compose.mjs';
import { emitRunbook } from './emit.mjs';
import { scanRunbook } from './scan.mjs';
import { backupFile } from './backup.mjs';

const NO_COST = { raw: null, count: null };

// Nothing reaches the page unconfirmed. A draft is walked through the same
// verifier a written runbook is walked through, before it is written.
export function verifyDrafts(sections, { runCommand, probeUrl }) {
  return sections.map((section) => ({
    ...section,
    drafts: section.drafts.map((draft) => {
      if (draft.verify.type === 'none') {
        return { ...draft, verdict: null, evidence: null };
      }

      const claim = { shape: draft.kind === 'pin' ? 'pin' : 'status-assertion', text: draft.text, cost: NO_COST };

      // The claim carries no `command`, on purpose. verifyPin only takes its
      // self-answering fast path (run the command named in the text, pass if
      // it doesn't throw) when claim.command is falsy; setting it forces the
      // other branch, where pinValue(claim.text) pulls the literal command
      // string out of the backticks as the "expected value" and compares it
      // against runCommand's actual output, which can never match. A
      // birth-time pin is exactly the self-answering shape compose.mjs
      // writes, so SELF_ANSWERING_RE in verify.mjs finds it in claim.text.
      // compose.mjs no longer carries a `verify.command` field at all
      // (2026-08-14 whole-branch review) -- a field whose only documentation
      // was "do not read this" is an invitation to wire it back up.
      const result =
        draft.verify.type === 'pin'
          ? verifyPin(claim, { runCommand })
          : verifyStatus({ ...claim, url: draft.verify.url }, { httpProbe: probeUrl });

      const decided = assignVerdict(claim, result);
      return { ...draft, verdict: decided.verdict, evidence: decided.evidence };
    }),
  }));
}

const GATHERERS = [sourceGatherer, gitGatherer, manifestGatherer];

// Review Fix 1 (coordinator round): `target.replace(/\.md$/, suffix)` returns
// the string UNCHANGED when the pattern does not match -- and it only ever
// matched a lowercase, exactly-".md" ending. `RUNBOOK` (no extension) and
// `RUNBOOK.markdown` never matched to begin with; `RUNBOOK.MD` looked like it
// should but didn't, because the regex had no /i. In every one of those
// cases `proposal === target`, so the "never clobber" branch below wrote the
// generated markdown straight onto the file it exists to protect, while
// still reporting `wrote: false` and printing "was NOT overwritten" -- a
// false claim on the one guarantee this path has. Case-insensitive match,
// and an unconditional append when there's nothing recognizable to replace,
// guarantees the result always differs from `target`.
function proposalPath(target) {
  return /\.md$/i.test(target)
    ? `${target.slice(0, -3)}.vibe-runbook-proposal.md`
    : `${target}.vibe-runbook-proposal.md`;
}

// Fix 2 (2026-08-14 whole-branch review). The url was known at generation
// and thrown away: compose put it in `verify.url`, only the bare path
// reached the rendered text, and nothing in the scan/classify path ever
// populates `claim.url`. So author -> scan -> walk on a generated document
// gave `BLOCKED - no url for this status assertion` on the only non-pin
// assertion :author can produce, and the report then asked the user to add
// a url to config.urls that the generator already had. Author writes it,
// walk keeps it true -- that story does not survive a permanently BLOCKED
// claim.
//
// config.urls is keyed by claim id, and claim ids are assigned by scan, so
// the ids are derived the one way that cannot drift from what a later
// `:scan` will produce: by scanning the emitted markdown here and matching
// each status draft to the claim extracted from it. The marker strips
// `**Right:** ` off the front, which is why this is a containment test
// rather than equality.
function urlsForEmittedClaims(markdown, target, sections) {
  const drafted = sections
    .flatMap((s) => s.drafts)
    .filter((d) => d.verify?.type === 'status' && d.verify.url);
  if (drafted.length === 0) return {};

  const urls = {};
  const { claims } = scanRunbook(markdown, target);
  for (const d of drafted) {
    const claim = claims.find((c) => c.shape === 'status-assertion' && d.text.includes(c.text));
    if (claim) urls[claim.id] = d.verify.url;
  }
  return urls;
}

// Merged, never clobbered. .vibe-runbook/config.json is a user-owned file --
// it carries their config.pins entries and any url they corrected by hand --
// so the generated entries are folded in and everything else is left exactly
// as it was. A malformed existing config is left alone entirely rather than
// overwritten with a guess about what it meant.
function mergeConfigUrls(projectRoot, urls) {
  if (Object.keys(urls).length === 0) return null;
  const dir = join(projectRoot, '.vibe-runbook');
  const configPath = join(dir, 'config.json');

  let existing = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      return null;
    }
  }

  const merged = { ...existing, urls: { ...(existing.urls ?? {}), ...urls } };
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return configPath;
}

// The only mutating path this half of the plugin has, and the posture is the
// same one remediate.mjs already committed to: gather, compose, and verify
// before a single byte is written, and never overwrite what is already
// there. A generated runbook is a proposal until a person says otherwise --
// the target only gets written when nothing occupies it yet.
//
// Async for the same reason runWalk is (Review Fix 2, coordinator round):
// verifyStatus's httpProbe contract is synchronous, but the real probeUrl
// binding (makeProbe) is an async fetch wrapper. Calling it from inside
// verifyDrafts's plain .map() -- as this used to -- never awaits it, so
// `observed` is a Promise, every status assertion reads as `[object
// Promise]`, and every health claim FAILs at the exact moment this plugin
// promises it already passed. Same fix as cli.mjs's walk branch: resolve
// every status-assertion url up front, into a synchronous lookup, and hand
// verifyDrafts that instead. verifyDrafts and verifyStatus stay untouched.
export async function authorRunbook(ctx) {
  const evidence = runGatherers(GATHERERS, ctx);
  // `ctx.env` is what decides whether anything gets probed at all, and which
  // host gets probed if so (Fix 1, 2026-08-14 whole-branch review). Undefined
  // means the health section composes to its stub question and no url is ever
  // built, so ctx.probeUrl is never reached.
  const composed = compose(evidence, { env: ctx.env });

  const probeResults = new Map();
  for (const section of composed) {
    for (const draft of section.drafts) {
      if (draft.verify.type !== 'status') continue;
      const url = draft.verify.url;
      if (!url || probeResults.has(url)) continue;
      try {
        probeResults.set(url, { status: await ctx.probeUrl(url) });
      } catch (e) {
        probeResults.set(url, { error: e });
      }
    }
  }
  const probe = (url) => {
    const r = probeResults.get(url);
    if (r?.error) throw r.error;
    return r?.status;
  };

  const sections = verifyDrafts(composed, { runCommand: ctx.runCommand, probeUrl: probe });
  const markdown = emitRunbook({
    appName: ctx.appName,
    sections,
    generatedFrom: evidence.ran,
  });

  const target = ctx.out ?? join(ctx.projectRoot, 'docs', 'RUNBOOK.md');
  mkdirSync(dirname(target), { recursive: true });

  // Never clobber. A tool whose product is trustworthiness does not overwrite
  // a person's documentation because it believed it knew better.
  if (existsSync(target)) {
    const proposal = proposalPath(target);
    backupFile(target);
    // Review Fix 4 (coordinator round): the real runbook was protected on
    // every run, but a proposal from a PREVIOUS :author run sitting at this
    // same path was not -- a third run silently replaced the second run's
    // proposal, which a person may be mid-review on. Same treatment as the
    // target: back it up before it's overwritten.
    if (existsSync(proposal)) backupFile(proposal);
    writeFileSync(proposal, markdown, 'utf8');
    // NO CONFIG WRITE ON THIS PATH (Fix B, CRITICAL, 2026-08-14 re-review).
    //
    // mergeConfigUrls used to run above this branch, before the never-clobber
    // decision was made. So on the common case -- a project that already has
    // docs/RUNBOOK.md -- the ids were derived from the PROPOSAL while :scan
    // and :walk read the operator's own document. The ids collide (both
    // start at c-001) and the url lands on whatever claim happens to occupy
    // that slot in a document it does not describe. Reproduced with no
    // hand-merging at all, just :author then :scan then :walk:
    //
    //   - `c-002` **PASS** - `/api/internal/billing-drain` answers 200.
    //     http://127.0.0.1:45897/api/health -> 200
    //
    // An operator's claim about a billing endpoint reported PASS on the
    // strength of a probe of a health endpoint. A false PASS is the one
    // failure this plugin cannot ship: every other thing it does -- the
    // stubs, the visible BLOCKED notes, the coverage fractions, the
    // never-clobber -- exists to make its reports trustworthy, and this made
    // one lie in the direction of reassurance.
    //
    // A proposal the operator has not adopted must teach the walker nothing.
    // When they merge it, the merged document's own ids are what a re-scan
    // assigns, and the url is theirs to add or to get from a later :author
    // run against a file that no longer exists.
    return { markdown, outPath: proposal, wrote: false, sections, evidence, configPath: null };
  }

  writeFileSync(target, markdown, 'utf8');
  // Written only now, and only here: the document this config describes is
  // the document that was just written to `target`, and the ids come from
  // exactly those bytes. Ordered after the write rather than before it so a
  // config failure can only ever leave a runbook whose status assertion
  // BLOCKs for want of a url -- never a config pointing at a document that
  // does not exist.
  const configPath = mergeConfigUrls(ctx.projectRoot, urlsForEmittedClaims(markdown, target, sections));
  return { markdown, outPath: target, wrote: true, sections, evidence, configPath };
}
