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
  }

  out.push(`**checked ${s.coverage.checked} of ${s.coverage.total} enumerated**`, '');
  for (const [state, n] of Object.entries(s.counts)) {
    if (n > 0) out.push(`- ${state}: ${n}`);
  }
  out.push('');

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
