import { summarize } from './verdict.mjs';
import { pickTemplate } from './remediate.mjs';

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
