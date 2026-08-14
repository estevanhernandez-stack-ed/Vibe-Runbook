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
  // checkedAt is cleared on both BLOCKED paths, not just left alone (Fix 10,
  // 2026-08-14 final review). A claim that PASSed at 17:55 and blocked on the
  // next walk otherwise keeps reporting 17:55 -- a stale timestamp on the one
  // tool whose entire product is being honest about staleness.
  if (!checkResult) return { ...claim, verdict: 'BLOCKED', evidence: 'not checked', checkedAt: null };
  if (checkResult.blocked) return { ...claim, verdict: 'BLOCKED', evidence: checkResult.blocked, checkedAt: null };

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
    // Only what actually landed SPENDS (Fix 9, 2026-08-14 final review). Cost
    // is read off the nearest heading, so a receipt or an unknown under a
    // `spends one check` section carries the annotation while never being a
    // candidate to spend on -- the shape gate above already took it to
    // QUESTION. Counting it quotes the reader a price for something this walk
    // would never buy.
    const raw = c.cost?.raw;
    if (c.verdict === 'SPENDS' && raw) wouldCost[raw] = (wouldCost[raw] ?? 0) + 1;
  }
  return { counts, coverage: { checked: counts.PASS + counts.FAIL, total: claims.length }, wouldCost };
}
