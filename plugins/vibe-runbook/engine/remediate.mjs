// Both templates fix the same shape, a stale pin. The discriminator is where
// the claim's reader stands. Offering the wrong one produces nonsense --
// value-to-command on "There are six tools" yields "run tools/list and count
// them" -- so shipping only one would be a correctness defect, not less scope.
export function pickTemplate(claim) {
  if (claim.shape !== 'pin') return null;
  return claim.venue === 'executable' ? 'value-to-command' : 'name-not-count';
}

export function proposeRewrite(claim, context = {}) {
  const template = pickTemplate(claim);
  if (!template) return null;

  if (template === 'value-to-command') {
    if (!context.command) throw new Error('value-to-command needs a command; it is never invented');
    const label = claim.text.split(/[:`]/)[0].trim();
    return {
      template,
      before: claim.text,
      after: `${label}: \`${context.command}\``,
      confidence: 0.95,
    };
  }

  if (!Array.isArray(context.members) || context.members.length === 0) {
    throw new Error('name-not-count needs the members it should name; it is never invented');
  }
  return {
    template,
    before: claim.text,
    after: context.members.map((m) => `\`${m}\``).join(', '),
    confidence: 0.9,
  };
}
