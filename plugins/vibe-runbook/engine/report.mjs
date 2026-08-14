import { summarize } from './verdict.mjs';
import { pickTemplate } from './remediate.mjs';

// Not every BLOCKED claim is stuck the same way. A pin with no known command
// or a status assertion with no known url is missing local context this tool
// was never told -- the user's to supply, and the report has to say exactly
// how, or the scan -> walk -> remediate loop dead-ends on the first real
// runbook someone points it at (Fix 2, 2026-08-14 review). A failed probe or
// a broken command is a different thing: the environment itself is the
// blocker, and there is no config entry that fixes that, so those get no
// invented next step and stay in the counts above, unembellished.
const MISSING_COMMAND_RE = /no command for this pin/i;
const MISSING_URL_RE = /no url for this status assertion/i;

function nextStep(claim) {
  if (!claim.evidence) return null;
  if (MISSING_COMMAND_RE.test(claim.evidence)) {
    return 'add it to `config.pins` in `.vibe-runbook/config.json`, or run `/vibe-runbook:remediate` to rewrite the claim so it answers itself';
  }
  if (MISSING_URL_RE.test(claim.evidence)) {
    return 'add it to `config.urls` in `.vibe-runbook/config.json`';
  }
  return null;
}

// Fixed order, walked shapes first, so two walks of the same runbook diff
// cleanly instead of reshuffling under the reader. The note is what makes a
// never-walked verdict readable as a decision rather than as a gap: verdict.mjs
// maps `receipt` and `unknown` onto the same QUESTION, correctly -- neither is
// verifiable -- and this is the only surface where the plugin's signature
// classification can be told apart from "could not classify" (Fix 3,
// 2026-08-14 final review).
const SHAPE_ORDER = [
  { shape: 'pin', note: null },
  { shape: 'status-assertion', note: null },
  {
    shape: 'receipt',
    note: 'Past-tense coverage records. Reported and never failed: a doc that says it tested 17 rooms is not lying when there are now 12.',
  },
  { shape: 'human', note: 'Real, and not machine-verifiable. Named so it is not quietly scored as a pass.' },
  {
    shape: 'unknown',
    note: 'Recognized as a claim; no rule could classify it. Reported as a QUESTION rather than guessed.',
  },
];

// Claim text is joined prose and runs long. Capped at a fixed width so a
// terminal stays readable and the same claim renders identically on every
// walk; the source line beside it is how the reader gets the rest.
const TEXT_WIDTH = 110;

function oneLine(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length <= TEXT_WIDTH ? flat : `${flat.slice(0, TEXT_WIDTH - 1).trimEnd()}…`;
}

// The file is printed by basename: the walk already names the runbook in its
// own heading, and a full path per claim buries the line number that is the
// point. Absent entirely on hand-built claims, and never invented.
function location(claim) {
  const file = claim.source?.file;
  const line = claim.source?.line;
  if (!file || !line) return null;
  return `${file.split(/[\\/]/).pop()}:${line}`;
}

// The whole reason this section exists (Fixes 1 and 2, 2026-08-14 final
// review). `evidence` was computed on every walk and used only as a routing
// key for BLOCKED next-steps, so a drifted pin holding
// "runbook says star-00049-j5r, system says star-00099-NEW" printed as
// `FAIL: 1` and nothing else -- the observed value, the single most valuable
// thing the tool produces, never reached the reader. And 17 QUESTIONs plus 2
// HUMANs in a 22-claim walk went entirely unmentioned, which is a wall of
// counts over three actionable lines: installed once, never opened again.
function claimDetail(claims) {
  const out = [];
  out.push('## Every claim, by shape', '');

  for (const { shape, note } of SHAPE_ORDER) {
    const group = claims.filter((c) => (c.shape ?? 'unknown') === shape);
    if (group.length === 0) continue;

    out.push(`### ${shape} — ${group.length}`, '');
    if (note) out.push(note, '');

    for (const c of group) {
      const where = location(c);
      const head = [`- \`${c.id}\``, `**${c.verdict ?? 'not walked'}**`];
      if (where) head.push(`· ${where}`);
      out.push(`${head.join(' ')} — ${oneLine(c.text)}`);
      if (c.evidence) out.push(`  ${oneLine(c.evidence)}`);
    }
    out.push('');
  }

  return out;
}

export function renderReport({ runbook, env, claims, coverage }) {
  const s = summarize(claims);
  const out = [];

  out.push(`# Runbook walk: ${runbook}`, '', `Environment: ${env}`, '');

  if (coverage?.confidence === 'low') {
    out.push(
      `**Could not read this runbook.** ${coverage.markedBlocks} marked blocks in ${coverage.totalBlocks}.`,
      '',
      coverage.guidance ?? '',
      ''
    );
  }

  // A different fraction from the one below, on purpose: this is how much of
  // the document was ever recognized as a checkable claim, not how many of
  // the recognized claims got verified. Rendered at every confidence level,
  // not only 'low' -- the 'low' threshold is 2%, so a document at 7% (1 real
  // marker in 13 blocks) still reads 'high' and would otherwise say nothing
  // about the 12 blocks nobody looked at. That silence is the exact failure
  // this tool exists to catch, so it cannot be conditional.
  const hasBlockCounts = typeof coverage?.totalBlocks === 'number' && typeof coverage?.markedBlocks === 'number';
  if (hasBlockCounts) {
    out.push(`**read ${coverage.markedBlocks} of ${coverage.totalBlocks} content blocks in the document**`, '');
    // Say what the remainder is, rather than leaving it as arithmetic. The
    // unrecognized blocks are the part of the document this tool cannot even
    // list, and the reader is owed that in words.
    const unread = coverage.totalBlocks - coverage.markedBlocks;
    if (unread > 0) {
      out.push(
        `The other ${unread} blocks matched no marker and no claim pattern. Nothing looked at them.`,
        ''
      );
    }
  }

  out.push(`**checked ${s.coverage.checked} of ${s.coverage.total} enumerated**`, '');
  for (const [state, n] of Object.entries(s.counts)) {
    if (n > 0) out.push(`- ${state}: ${n}`);
  }
  out.push('');

  if (claims.length > 0) out.push(...claimDetail(claims));

  const actionable = claims.filter((c) => c.verdict === 'BLOCKED' && nextStep(c));
  if (actionable.length > 0) {
    out.push('## Needs your input to check', '');
    for (const c of actionable) out.push(`- \`${c.id}\` ${c.text} — ${nextStep(c)}`);
    out.push('');
  }

  const costLines = Object.entries(s.wouldCost);
  if (costLines.length > 0) {
    out.push('## What a full walk would cost', '');
    for (const [raw, n] of costLines) out.push(`- ${raw} × ${n}`);
    out.push('', 'Nothing above was spent.', '');
    out.push('You can **authorize** these and run them yourself, or **rewrite** the claims so they do not need spending.', '');
  }

  const fixable = claims.filter((c) => c.verdict === 'FAIL' && pickTemplate(c));
  if (fixable.length > 0) {
    out.push('## Available remediation', '');
    for (const c of fixable) out.push(`- \`${c.id}\` ${c.text} → **${pickTemplate(c)}**`);
    out.push('', 'Run `/vibe-runbook:remediate` to see the diffs. Nothing is written without it.', '');
  }

  return out.join('\n');
}
