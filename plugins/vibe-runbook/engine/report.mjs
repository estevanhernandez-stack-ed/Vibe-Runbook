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
