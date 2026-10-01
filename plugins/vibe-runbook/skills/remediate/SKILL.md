---
name: remediate
description: This skill should be used when the user says "/vibe-runbook:remediate", "fix my stale pins", or accepts the remediation the walk report offered. Mutating and opt-in; backs up every file before writing.
---

# vibe-runbook remediate

Load skills/guide/SKILL.md. Requires a completed walk.

Run the engine. Never hand-roll the rewrite — the templates, the venue rule,
the backup and the verbatim file match are all in the engine, and a hand-rolled
edit bypasses every one of them.

```
cd ${CLAUDE_PLUGIN_ROOT}
node engine/cli.mjs remediate --project <path to the user's project>
```

That prints every diff and writes nothing. Read the diffs out to the user.

1. **Under "Cannot rewrite without you"**, the engine refused to guess. A
   `value-to-command` rewrite needs the real command and a `name-not-count`
   rewrite needs the real members; neither is ever invented. Each entry names
   the exact config key to add:
   - a command → `config.pins.<label>` in `<project>/.vibe-runbook/config.json`
   - the members → `config.members.<claim id>` in the same file

   Get them from the user or from the contract source, add them, and re-run.
2. **Only after the user says yes**, write:

   ```
   node engine/cli.mjs remediate --project <path> --apply
   ```

   Each file is backed up before its first write and the backup paths are
   printed. Roll back by copying a backup over the file it names.
3. A claim with no verbatim match in its file is skipped and named, not guessed
   at. Two causes:
   - The document moved under the cached scan. Re-run `:scan`, walk again, then
     remediate.
   - **The claim was joined across a line wrap** and has no single-line span to
     replace. STAR's own HEAD pin is this shape: `HEAD` ends one line and
     `` `0855bd2` `` opens the next inside a blockquote. The claim is correct;
     rewriting it means rewriting the wrap, which remediate does not do yet. Offer the
     user the diff to apply by hand instead — the `after` line is exact.
4. Report the backup paths so a rollback is one step.

`--apply` is the only difference between reading and writing. Never add it
because a walk found something; add it because the user asked for it.
