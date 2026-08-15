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

// The only mutating path this half of the plugin has, and the posture is the
// same one remediate.mjs already committed to: gather, compose, and verify
// before a single byte is written, and never overwrite what is already
// there. A generated runbook is a proposal until a person says otherwise --
// the target only gets written when nothing occupies it yet.
export function authorRunbook(ctx) {
  const evidence = runGatherers(GATHERERS, ctx);
  const composed = compose(evidence);
  const sections = verifyDrafts(composed, ctx);
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
    const proposal = target.replace(/\.md$/, '.vibe-runbook-proposal.md');
    backupFile(target);
    writeFileSync(proposal, markdown, 'utf8');
    return { markdown, outPath: proposal, wrote: false, sections, evidence };
  }

  writeFileSync(target, markdown, 'utf8');
  return { markdown, outPath: target, wrote: true, sections, evidence };
}
