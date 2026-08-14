import { stripOuterMarkup } from './classify.mjs';
import { isSelfAnswering } from './verify.mjs';

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
    // stripOuterMarkup first, the same normalizer verify.mjs's resolveCommand
    // uses (Fix 4, 2026-08-14 final review, found while wiring this to a real
    // CLI). Splitting raw text means the real shape extract.mjs produces from
    // a preamble -- "**Revision `star-00049-j5r`**" -- rewrites to
    // "**Revision — run: `...`", leaving a dangling `**` in the user's
    // document. `before` stays verbatim: it is matched byte-for-byte against
    // the file when the rewrite is applied.
    const label = stripOuterMarkup(claim.text).split(/[:`]/)[0].trim();
    // Fix 1 (2026-08-14 review): a bare `label: \`command\`` was
    // indistinguishable from a bare `label: \`value\`` on re-scan, so
    // verify.mjs read the command text as an expected value and compared it
    // against the command's output -- a comparison that can only pass if a
    // command echoes its own source. The `run:` marker makes "this backtick
    // span is an invocation, not a value" a fact of the text itself, which
    // is what lets verifyPin recognize the pin as self-answering instead of
    // re-deriving it heuristically.
    return {
      template,
      before: claim.text,
      after: `${label} — run: \`${context.command}\``,
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

// Where a rewrite's context comes from, and it is never invented. A
// value-to-command needs the actual command; a name-not-count needs the actual
// members. Both live in .vibe-runbook/config.json -- commands under
// `pins`, keyed by the pin's label the same way verify.mjs keys them, and
// members under `members`, keyed by claim id because a list has no label to
// key on.
function contextFor(claim, template, config) {
  if (template === 'value-to-command') {
    const label = stripOuterMarkup(claim.text).split(/[:`]/)[0].trim().toLowerCase();
    const command = config.pins?.[label] ?? null;
    return command
      ? { context: { command } }
      : { ask: `add the command that answers it to \`config.pins.${label}\` in .vibe-runbook/config.json` };
  }
  const members = config.members?.[claim.id];
  return Array.isArray(members) && members.length > 0
    ? { context: { members } }
    : { ask: `add the members it was summarizing to \`config.members.${claim.id}\` in .vibe-runbook/config.json` };
}

// A pin is a remediation candidate when it is stale (FAIL) or could not be
// told apart from stale (BLOCKED). A PASSing pin is not stale, and a SPENDS
// pin was never checked. A pin that already names its command is where this
// command is trying to get every pin to, so it is finished, not a candidate.
const CANDIDATE_VERDICTS = new Set(['FAIL', 'BLOCKED']);

export function planRemediation(claims, config = {}) {
  const proposals = [];
  const needsContext = [];

  for (const claim of claims) {
    const template = pickTemplate(claim);
    if (!template) continue;
    if (!CANDIDATE_VERDICTS.has(claim.verdict)) continue;
    if (isSelfAnswering(claim)) continue;

    const { context, ask } = contextFor(claim, template, config);
    if (!context) {
      needsContext.push({ id: claim.id, text: claim.text, template, source: claim.source, ask });
      continue;
    }
    proposals.push({ id: claim.id, source: claim.source, ...proposeRewrite(claim, context) });
  }

  return { proposals, needsContext };
}

function where(source) {
  if (!source?.file || !source?.line) return null;
  return `${String(source.file).split(/[\\/]/).pop()}:${source.line}`;
}

// Every diff, always. `applied` only changes what the closing line says about
// what happened -- the diffs themselves are the product either way, and the
// default path prints them and stops.
export function renderPlan({ proposals, needsContext }, { applied = false, backups = [] } = {}) {
  const out = ['# Runbook remediation', ''];

  if (proposals.length === 0 && needsContext.length === 0) {
    out.push('No stale pins to rewrite. Nothing was written.', '');
    return out.join('\n');
  }

  if (proposals.length > 0) {
    out.push(`## Proposed rewrites — ${proposals.length}`, '');
    for (const p of proposals) {
      const loc = where(p.source);
      out.push(`**\`${p.id}\`** · ${p.template}${loc ? ` · ${loc}` : ''}`, '');
      out.push('```diff', `- ${p.before}`, `+ ${p.after}`, '```', '');
    }
  }

  if (needsContext.length > 0) {
    out.push(`## Cannot rewrite without you — ${needsContext.length}`, '');
    out.push('These are stale pins the template refuses to guess at. Nothing here is invented.', '');
    for (const n of needsContext) {
      const loc = where(n.source);
      out.push(`- \`${n.id}\`${loc ? ` · ${loc}` : ''} — ${n.text}`);
      out.push(`  ${n.ask}`);
    }
    out.push('');
  }

  if (!applied) {
    out.push(
      'Nothing was written. Re-run with `--apply` to write these rewrites; every file is backed up first.',
      ''
    );
  } else {
    out.push(`Written. ${backups.length} file${backups.length === 1 ? '' : 's'} backed up first:`, '');
    for (const b of backups) out.push(`- ${b}`);
    out.push('', 'Roll back by copying a backup over the file it names.', '');
  }

  return out.join('\n');
}
