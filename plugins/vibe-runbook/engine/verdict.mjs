// Shapes that are never verified, and what they report instead. A receipt is
// past-tense evidence of what was tested; it drifts because the world moved,
// not because the doc lied. Failing it is the noise that gets the tool muted.
const NEVER_WALKED = { receipt: 'QUESTION', human: 'HUMAN', unknown: 'QUESTION' };

export function assignVerdict(claim, checkResult) {
  const fixed = NEVER_WALKED[claim.shape];
  if (fixed) return { ...claim, verdict: fixed, checkedAt: null };

  if ((claim.cost?.count ?? 0) > 0) {
    return { ...claim, verdict: 'SPENDS', evidence: null, checkedAt: null };
  }
  if (!checkResult) return { ...claim, verdict: 'BLOCKED', evidence: 'not checked' };
  if (checkResult.blocked) return { ...claim, verdict: 'BLOCKED', evidence: checkResult.blocked };

  return {
    ...claim,
    verdict: checkResult.ok ? 'PASS' : 'FAIL',
    evidence: checkResult.evidence ?? null,
    checkedAt: new Date().toISOString(),
  };
}

export function summarize(claims) {
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, SPENDS: 0, HUMAN: 0, QUESTION: 0 };
  const wouldCost = {};
  for (const c of claims) {
    if (c.verdict in counts) counts[c.verdict] += 1;
    const raw = c.cost?.raw;
    if (raw && (c.cost?.count ?? 0) > 0) wouldCost[raw] = (wouldCost[raw] ?? 0) + 1;
  }
  return { counts, coverage: { checked: counts.PASS + counts.FAIL, total: claims.length }, wouldCost };
}
