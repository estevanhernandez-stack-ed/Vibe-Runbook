import { verifyPin, verifyStatus } from './verify.mjs';
import { assignVerdict } from './verdict.mjs';

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
