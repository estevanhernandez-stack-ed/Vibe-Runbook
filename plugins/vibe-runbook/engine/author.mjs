import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { verifyPin, verifyStatus } from './verify.mjs';
import { assignVerdict } from './verdict.mjs';
import { runGatherers } from './gather/contract.mjs';
import { sourceGatherer } from './gather/source.mjs';
import { gitGatherer } from './gather/git.mjs';
import { manifestGatherer } from './gather/manifest.mjs';
import { compose } from './compose.mjs';
import { emitRunbook } from './emit.mjs';
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

      // Controller fix: do not forward draft.verify.command as claim.command.
      // verifyPin only takes its self-answering fast path (run the command
      // named in the text, pass if it doesn't throw) when claim.command is
      // falsy -- passing the command through here forced the other branch,
      // where pinValue(claim.text) pulled the literal command string out of
      // the backticks as the "expected value" and compared it against
      // runCommand's actual output, which can never match. A birth-time pin
      // is exactly the self-answering shape compose.mjs already writes, so
      // let SELF_ANSWERING_RE in verify.mjs find it in claim.text itself.
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
  const composed = compose(evidence);

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
    return { markdown, outPath: proposal, wrote: false, sections, evidence };
  }

  writeFileSync(target, markdown, 'utf8');
  return { markdown, outPath: target, wrote: true, sections, evidence };
}
