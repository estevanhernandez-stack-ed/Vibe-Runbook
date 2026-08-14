import { matchStub } from './stubs.mjs';
import { fenceDelimiter, fenceCloses } from './fence.mjs';

// Markers a runbook may use to flag a checkable claim. Este's habit is the
// seed set; the honesty gate in Task 2 is what keeps unmarked docs truthful.
// `re` requires content after the marker on the same logical line (after
// continuation-joining, below); `bareRe` recognizes the marker with nothing
// after it at all — how a `**Right:**` whose content lives in a bulleted
// list underneath it gets found, instead of silently matching nothing.
const MARKERS = [
  {
    name: 'right',
    re: /^\s*\*\*Right(?:,[^*]*)?:\*\*\s*(.+)$/i,
    bareRe: /^\s*\*\*Right(?:,[^*]*)?:\*\*\s*$/i,
  },
  {
    name: 'wrong',
    re: /^\s*\*\*Wrong[^*]*:\*\*\s*(.+)$/i,
    bareRe: /^\s*\*\*Wrong[^*]*:\*\*\s*$/i,
  },
  {
    name: 'expect',
    re: /^\s*\*\*(?:Expected|Should)[^*]*:\*\*\s*(.+)$/i,
    bareRe: /^\s*\*\*(?:Expected|Should)[^*]*:\*\*\s*$/i,
  },
];

// A bolded or backticked label-value pair, e.g. "**Revision `star-00049-j5r`**"
// or "HEAD `0855bd2`" — the highest-value claims in a real runbook live in its
// opening blockquote with no **Right:**/**Wrong:** marker at all. Over-extraction
// here is fine: a later task's classifier routes anything it can't identify to
// `unknown`, which reports as a QUESTION rather than a false failure. Vacuous
// section-intro labels ("**Where you are:**", "**Why this list exists.**")
// are filtered out below by isVacuousLabel — they carry no checkable value,
// and a report that flags meaningless items trains its reader to stop
// reading it.
const PREAMBLE_PATTERNS = [
  { kind: 'bold', re: /\*\*[^*]+\*\*/g },
  { kind: 'backtick', re: /`[^`]+`/g },
];

// True when a bold span is nothing but a plain-English section-intro label —
// no backtick, no digit, no quoted/id-shaped content — terminated by ':' or
// '.'. e.g. "**Where you are:**" or "**Why this list exists.**". A capture
// that contains a backticked span, or any alphanumeric token beyond the
// label itself (a digit, an id, a number), is never vacuous.
function isVacuousLabel(text) {
  const inner = text.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  if (/`/.test(inner)) return false;
  return /^[A-Za-z][A-Za-z\s',-]*[:.]$/.test(inner);
}

function isBlockquoteLine(line) {
  return /^\s*>/.test(line);
}

function stripBlockquotePrefix(line) {
  return line.replace(/^\s*>\s?/, '');
}

function isHeadingLine(line) {
  return /^\s*#{1,6}\s/.test(line);
}

function isListItemStart(line) {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function stripListMarker(line) {
  return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
}

function isTableRowStart(line) {
  return /^\s*\|/.test(line);
}

// Walks `text` once, treating a `**bold**` or `` `backtick` `` span as
// atomic, and splits on top-level occurrences of `char` — one that falls
// outside both kinds of span. A comma inside "`24 scenes · 67 claims`" or a
// period inside "**...are open.**" is content, never a boundary. Each
// returned segment carries `start`, its 0-indexed offset within `text` —
// callers use that to trace a segment back to the physical line it actually
// came from, rather than crediting it to wherever its paragraph began.
function splitTopLevel(text, char) {
  const segments = [];
  let cur = '';
  let curStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      const stop = end === -1 ? text.length : end + 1;
      cur += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      cur += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (text[i] === char) {
      segments.push({ text: cur, start: curStart });
      cur = '';
      i += 1;
      curStart = i;
      continue;
    }
    cur += text[i];
    i += 1;
  }
  segments.push({ text: cur, start: curStart });
  return segments;
}

// Trims `raw` and shifts its offset to match — trimming a segment's leading
// whitespace away must not lose track of where its *content* actually
// starts.
function trimWithOffset(raw, baseOffset) {
  const leading = raw.length - raw.trimStart().length;
  return { text: raw.trim(), start: baseOffset + leading };
}

// A document with almost no marked blocks is one we cannot read, and saying
// so is the product. Silence here would read as "nothing to check".
const LOW_CONFIDENCE_RATIO = 0.02;

function markupGuidance(filePath, totalBlocks, markedBlocks) {
  // The ratio can be "low" with markedBlocks > 0 -- a 1200-line doc with 20
  // real markers is still below LOW_CONFIDENCE_RATIO. Saying "found no
  // marked claims" in that case would be false, and honesty about what was
  // read is the entire point of this branch. Report what was actually
  // found, not an assumption that it was zero.
  const finding = markedBlocks === 0
    ? `Read ${totalBlocks} blocks in ${filePath} and found no marked claims.`
    : `Read ${totalBlocks} blocks in ${filePath} and found only ${markedBlocks} ` +
      `marked claim${markedBlocks === 1 ? '' : 's'}, which is sparse enough that ` +
      'this document is probably mostly unmarked prose.';
  return [
    finding,
    'Claims are located by marker. Mark what "right" looks like so it can be walked:',
    '',
    '    **Right:** the health endpoint answers 200 with the build sha',
    '',
    'Supported markers: **Right:**, **Wrong ...:**, **Expected:**, **Should:**',
  ].join('\n');
}

// A fence that opens and never closes is a structural defect, not a style
// choice -- once `fence` is set in the walking loops below, every line
// after it becomes invisible to both counting and unit-building, so the
// document's tail is silently unread through EOF. countContentLines still
// counts the swallowed lines (they were read), which is exactly what makes
// this dangerous: a short document could lose real claims to a swallowed
// tail and still read `confidence: 'high'`, because the denominator never
// shrank to reveal the loss. Detected once, up front, so extractClaims can
// refuse to report undiminished confidence over a read that quietly
// stopped partway through. Returns the 1-indexed line the unclosed fence
// opened on, or null if every fence in the document closed.
function findUnterminatedFence(lines) {
  let fence = null;
  let openedAt = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence) {
      if (fenceCloses(line, fence)) {
        fence = null;
        openedAt = null;
      }
      continue;
    }
    const opener = fenceDelimiter(line);
    if (opener) {
      fence = opener;
      openedAt = i + 1;
    }
  }
  return openedAt;
}

function unterminatedFenceGuidance(filePath, line) {
  return [
    `A fenced code block opened at ${filePath}:${line} was never closed. ` +
      'Every line after it was skipped rather than read, so this result cannot ' +
      'be trusted at whatever confidence the marker count alone would suggest.',
    'Close the fence (matching backtick or tilde count) or remove the stray opening line, then re-run.',
  ].join('\n');
}

// The density ratio's denominator: how much document there actually is, in
// physical lines, independent of how extraction groups those lines into
// claims. Grouping and counting used to be the same pass — a claim that
// joined ten physical lines into one unit also collapsed those ten lines
// into one count — which is exactly backwards for a ratio whose job is to
// catch a mostly-unmarked document. A blank line and a heading carry no
// content; a bare blockquote line (just ">", the paragraph break inside a
// preamble) carries none either. Everything else is one block, whether or
// not extraction later folds it into a bigger claim.
function countContentLines(lines) {
  let count = 0;
  let fence = null;
  for (const line of lines) {
    if (fence) {
      // Fenced content is never a heading (a shell "# comment" line reads
      // like one to isHeadingLine's line-shape check, and is not) -- but it
      // was still read, so it still counts. Skip only a true blank line,
      // same as outside a fence.
      if (fenceCloses(line, fence)) fence = null;
      if (line.trim() === '') continue;
      count += 1;
      continue;
    }
    const opener = fenceDelimiter(line);
    if (opener) fence = opener;
    if (line.trim() === '') continue;
    if (isHeadingLine(line)) continue;
    if (isBlockquoteLine(line) && stripBlockquotePrefix(line).trim() === '') continue;
    count += 1;
  }
  return count;
}

// Groups a run of physical lines into logical units for the body scan. A
// unit is a maximal run of continuation lines belonging to one marker line,
// one list item, or one unmarked paragraph — a blank line, a heading, and a
// new list item's own bullet all end the current unit and start the next.
// This is the join that lets a `**Right:**` sentence (or a list item under
// one) that wraps across physical lines reach the marker regex whole. It
// exists purely to assemble claims — countContentLines above is where the
// ratio's denominator comes from, deliberately not this.
function groupIntoUnits(lines, startIdx, endIdxExclusive) {
  const units = [];
  let cur = null;
  let fence = null;
  const flush = () => {
    if (cur && cur.lines.length) units.push(cur);
    cur = null;
  };
  for (let i = startIdx; i < endIdxExclusive; i += 1) {
    const raw = lines[i];

    if (fence) {
      // Fenced content is code, not prose: it never joins a unit's text.
      if (fenceCloses(raw, fence)) fence = null;
      continue;
    }
    const opener = fenceDelimiter(raw);
    if (opener) {
      // Round 3 correction: a fence used to be transparent here -- left
      // `cur` open so prose immediately before and after it could join
      // into one claim. That was itself the bug. "**Right:** the endpoint
      // answers 200" + a fence + "with the build sha" joined into "the
      // endpoint answers 200 with the build sha", a string that exists
      // nowhere in the file -- two fragments glued across a gap that, in
      // the real document, has other real content sitting in it.
      // Remediation matches claim.text back byte-for-byte, so a fabricated
      // join is a permanently unmatchable claim. A fence now flushes the
      // unit it interrupts, the same as a blank line or a heading: content
      // before and after a fence can never share one claim's text again,
      // even at the cost of a real catch split by a fence not being found
      // (accepted; see the marker-widening report).
      flush();
      fence = opener;
      continue;
    }

    if (raw.trim() === '' || isHeadingLine(raw) || isBlockquoteLine(raw) || matchStub(raw)) {
      // A stub line is real content a reader sees (countContentLines below
      // still counts it) but it is not a claim -- there is nothing to check
      // in an admission that a section wasn't written. Excluding it here
      // keeps it out of every unit the marker/bare/prose passes see, and it
      // still breaks a unit the same way a blank line does, so it can never
      // fuse adjacent claims into one fabricated string either.
      flush();
      continue;
    }
    if (isListItemStart(raw)) {
      flush();
      cur = { lines: [stripListMarker(raw)], startLine: i + 1, isListItem: true };
      continue;
    }
    if (isTableRowStart(raw)) {
      flush();
      cur = { lines: [raw.trim()], startLine: i + 1, isListItem: false, isTableRow: true };
      continue;
    }
    if (cur === null) {
      cur = { lines: [raw], startLine: i + 1, isListItem: false };
    } else {
      cur.lines.push(raw);
    }
  }
  flush();
  return units;
}

function joinUnit(unit) {
  return unit.lines.map((l) => l.trim()).join(' ');
}

function isMarkerText(text) {
  return MARKERS.some((mk) => mk.re.test(text) || mk.bareRe.test(text));
}

// Round 3, Fix 2: a bare marker's content usually lives in the very next
// unit -- but a fence's own content never becomes a unit at all (it's
// invisible to groupIntoUnits by design), so "**Expected:**" immediately
// followed by a fenced JSON body used to find nothing there and produce no
// claim, even though before this widening's fence-awareness even existed
// it produced one. Expected-output-in-a-fence-under-an-Expected-line is
// mainstream ops idiom, and the author wrote an explicit marker for
// exactly this content.
//
// Walks the raw physical lines directly, starting right after the bare
// marker's own unit, because that is the only place fenced content can be
// found -- it was never assembled into a unit to look up. Requires the
// fence to open on the very next physical line (no intervening blank
// line): the reviewer's own example is this exact adjacency, and it is the
// only shape that's unambiguous. Returns null (not a fabricated claim) if
// the fence right there never closes -- that is Fix 1's job (force low
// confidence, name the line), not this function's.
function fenceContentImmediatelyAfter(lines, unit) {
  const afterIdx = unit.startLine - 1 + unit.lines.length; // 0-indexed
  if (afterIdx >= lines.length) return null;
  const opener = fenceDelimiter(lines[afterIdx]);
  if (!opener) return null;
  const contentLines = [];
  let i = afterIdx + 1;
  while (i < lines.length && !fenceCloses(lines[i], opener)) {
    contentLines.push(lines[i]);
    i += 1;
  }
  if (i >= lines.length) return null; // unterminated; let EOF reconciliation handle it
  const text = contentLines.map((l) => l.trim()).join(' ').trim();
  return text ? { text } : null;
}

// A checkable claim doesn't need a bold **Right:**/**Wrong:**/**Should:**
// marker -- most runbooks state the same expectation as ordinary sentence
// prose ("Database: Status should be "ok"", "**Max Attempts**: Should be 0")
// and MARKERS, being line-anchored, never sees it. This is the mid-line
// signal: any of these phrases appearing anywhere in the block, not at the
// start of a line. Case-insensitive, word-bounded so "shoulder" doesn't
// misfire on "should be".
//
// Scoped to list items only (see PROSE_MARKER handling below), on purpose:
// unmarked.md's own prose reads "You should see a 200 come back" and "The
// error rate panel should be flat" -- both contain a required phrase, in an
// ordinary flowing paragraph a person wrote about what they will see with
// their own eyes, not an enumerated checklist item. Matching those would
// flip that fixture's zero-claims premise and start inferring a claim from
// narration rather than reading one the author actually enumerated. Every
// real positive control this widening targets (PriceScout, Reel-Battles,
// STAR's own body prose) states its expectation as a list item; the
// negative controls that must stay silent do not.
const PROSE_EXPECTATION_RE = /\b(?:should be|should return|should show|should see|should read|must be|verify that|expected output)\b/i;

function hasProseExpectation(text) {
  return PROSE_EXPECTATION_RE.test(text);
}

// The physical line that contains a given offset into a paragraph's joined
// text. `boundaries` is ordered by offset, one entry per physical line that
// fed the paragraph; the last boundary at or before `offset` is the line
// that offset actually landed on.
function lineForOffset(boundaries, offset) {
  let line = boundaries.length ? boundaries[0].line : null;
  for (const b of boundaries) {
    if (b.start > offset) break;
    line = b.line;
  }
  return line;
}

export function extractClaims(markdown, filePath) {
  const lines = markdown.split(/\r?\n/);
  const claims = [];
  // Every block this pass recognized as carrying a claim, marker-tagged or
  // preamble alike. Preamble claims used to increment nothing (Fix 7,
  // 2026-08-14 final review), which put the report's two headline fractions
  // in open contradiction: 'read 17 of 229 content blocks' above 'checked 2
  // of 22 enumerated'. 22 > 17 is impossible on its face, and it excluded
  // exactly the claims the report then acted on -- the pins in the opening
  // blockquote. One increment per claim pushed, everywhere, is the invariant:
  // markedBlocks can never be less than claims.length.
  let markedBlocks = 0;
  let n = 0;

  // The preamble is the run of `>`-prefixed lines before the first `##`
  // heading. Walk it first so preamble claim ids sort ahead of marker claims,
  // matching their position in the document. Note: this stops at level-2+
  // headings only — the document's level-1 title (`# Title`) sits above the
  // blockquote and must not end the scan early.
  let preambleEnd = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*#{2,6}\s/.test(lines[i])) break;
    if (isBlockquoteLine(lines[i])) preambleEnd = i;
  }

  if (preambleEnd >= 0) {
    // Group the blockquote into logical paragraphs before recognizing
    // anything in it — markdown wraps a paragraph across physical lines,
    // and a bare blockquote line ("just >") is the paragraph break, the
    // same way it reads to a person. `boundaries` remembers which physical
    // line fed which offset of the joined text, so a claim found anywhere
    // in the paragraph can be traced back to the line it actually starts
    // on instead of the paragraph's first line.
    const paragraphs = [];
    let curLines = [];
    const flushParagraph = () => {
      if (curLines.length) {
        let offset = 0;
        const boundaries = [];
        const parts = [];
        for (const entry of curLines) {
          boundaries.push({ start: offset, line: entry.line });
          parts.push(entry.text);
          offset += entry.text.length + 1; // +1 for the joining space
        }
        paragraphs.push({ text: parts.join(' '), boundaries });
      }
      curLines = [];
    };
    for (let i = 0; i <= preambleEnd; i += 1) {
      const raw = lines[i];
      if (!isBlockquoteLine(raw)) {
        flushParagraph();
        continue;
      }
      const content = stripBlockquotePrefix(raw).trim();
      if (content === '' || matchStub(content)) {
        // A stub can only ever be a paragraph break here, never content: an
        // unwritten section is not a claim, so a blockquoted one must not
        // reach the preamble pass any more than a bare one reaches the body
        // pass below. Same treatment as a blank blockquote line.
        flushParagraph();
        continue;
      }
      curLines.push({ text: content, line: i + 1 });
    }
    flushParagraph();

    for (const { text: paragraphText, boundaries } of paragraphs) {
      const seenInParagraph = new Set();
      // Split into sentences so a comma inside an earlier, unrelated clause
      // of the same paragraph never bleeds into a pin-list sentence
      // elsewhere in it.
      for (const rawSentence of splitTopLevel(paragraphText, '.')) {
        const { text: sentence, start: sentenceStart } = trimWithOffset(rawSentence.text, rawSentence.start);
        if (!sentence) continue;

        if (sentence.includes('`')) {
          // A sentence carrying a backtick is a listing of labelled
          // values, comma-separated: "**Revision `x`**, HEAD `y`, 931
          // tests green, working tree in sync" is four claims, not one —
          // split on the commas that live outside a span, so each pin
          // becomes its own claim including the bare-prose ones that
          // carry no bold or backtick at all.
          for (const rawSeg of splitTopLevel(sentence, ',')) {
            const { text: seg, start: segStart } = trimWithOffset(rawSeg.text, sentenceStart + rawSeg.start);
            if (!seg || seenInParagraph.has(seg)) continue;
            if (/^\*\*.*\*\*$/.test(seg) && isVacuousLabel(seg)) continue;
            seenInParagraph.add(seg);
            markedBlocks += 1;
            n += 1;
            claims.push({
              id: `c-${String(n).padStart(3, '0')}`,
              source: { file: filePath, line: lineForOffset(boundaries, segStart) },
              text: seg,
              marker: 'preamble',
            });
          }
          continue;
        }

        // No backtick anywhere in this sentence: the original bold/backtick
        // span scan, unchanged in spirit, now running against a whole
        // logical sentence instead of one physical line.
        for (const { kind, re } of PREAMBLE_PATTERNS) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(sentence)) !== null) {
            const text = m[0].trim();
            if (!text || seenInParagraph.has(text)) continue;
            if (kind === 'bold' && isVacuousLabel(text)) continue;
            seenInParagraph.add(text);
            markedBlocks += 1;
            n += 1;
            claims.push({
              id: `c-${String(n).padStart(3, '0')}`,
              source: { file: filePath, line: lineForOffset(boundaries, sentenceStart + m.index) },
              text,
              marker: 'preamble',
            });
          }
        }
      }
    }
  }

  // The body scan starts right after the preamble. The blockquote is fully
  // handled above; letting it fall into the unit grouping below too would
  // merge the whole thing into one meaningless unit, because nothing in it
  // is blank in the physical sense — every line starts with '>'.
  const bodyStart = preambleEnd >= 0 ? preambleEnd + 1 : 0;
  const units = groupIntoUnits(lines, bodyStart, lines.length);

  let u = 0;
  while (u < units.length) {
    const unit = units[u];
    const text = joinUnit(unit);

    const inline = MARKERS.find((mk) => mk.re.test(text));
    if (inline) {
      const m = text.match(inline.re);
      markedBlocks += 1;
      n += 1;
      claims.push({
        id: `c-${String(n).padStart(3, '0')}`,
        source: { file: filePath, line: unit.startLine },
        text: m[1].trim(),
        marker: inline.name,
      });
      u += 1;
      continue;
    }

    const bare = MARKERS.find((mk) => mk.bareRe.test(text));
    if (bare) {
      // Checked first, ahead of both branches below: a fence sitting
      // directly after the marker means neither of them applies -- there
      // is no "next unit" made of the fence's own content (fences are
      // invisible to unit-building), and whatever unit comes after the
      // fence closes is not this marker's content just because it happens
      // to be next in the units array.
      const fenceContent = fenceContentImmediatelyAfter(lines, unit);
      if (fenceContent) {
        markedBlocks += 1;
        n += 1;
        claims.push({
          id: `c-${String(n).padStart(3, '0')}`,
          source: { file: filePath, line: unit.startLine },
          text: fenceContent.text,
          marker: bare.name,
        });
        u += 1;
        continue;
      }

      const next = units[u + 1];
      if (next && next.isListItem) {
        // The next block is a list: this is the Task 1 case, a bare
        // marker whose content lives in the bullets below it. Each item
        // is its own claim, own line, own reading.
        let k = u + 1;
        while (k < units.length && units[k].isListItem) {
          const itemText = joinUnit(units[k]);
          markedBlocks += 1;
          n += 1;
          claims.push({
            id: `c-${String(n).padStart(3, '0')}`,
            source: { file: filePath, line: units[k].startLine },
            text: itemText,
            marker: bare.name,
          });
          k += 1;
        }
        u = k;
        continue;
      }
      const nextText = next ? joinUnit(next) : null;
      if (next && !isMarkerText(nextText)) {
        markedBlocks += 1;
        n += 1;
        claims.push({
          id: `c-${String(n).padStart(3, '0')}`,
          source: { file: filePath, line: next.startLine },
          text: nextText,
          marker: bare.name,
        });
        u += 2;
        continue;
      }
      // A bare marker with nothing usable following it (end of document,
      // or another marker immediately after). Known, accepted limitation.
      u += 1;
      continue;
    }

    // Neither a line-anchored bold marker nor its bare form: the last
    // chance for this unit to be a claim is a mid-line prose expectation,
    // and only inside a list item or a table row -- see hasProseExpectation
    // above for why flowing paragraph text doesn't qualify. A table cell
    // ("| Database | Status should be "ok" |") is the same enumerated-line
    // shape as a list item's "Database: Status should be "ok"" -- same
    // explicit word, just a pipe cell instead of a bullet.
    if ((unit.isListItem || unit.isTableRow) && hasProseExpectation(text)) {
      markedBlocks += 1;
      n += 1;
      claims.push({
        id: `c-${String(n).padStart(3, '0')}`,
        source: { file: filePath, line: unit.startLine },
        text,
        marker: 'prose',
      });
      u += 1;
      continue;
    }

    u += 1;
  }

  const totalBlocks = countContentLines(lines);
  const ratio = totalBlocks === 0 ? 0 : markedBlocks / totalBlocks;
  // An unterminated fence overrides the ratio outright, regardless of what
  // it computed to: the marker count alone cannot be trusted once part of
  // the document was silently unread, whether or not that happened to
  // still clear the ratio threshold on its own. Its guidance also takes
  // priority over the generic sparse-markup message -- naming the exact
  // structural defect and its line is more actionable than "mark what
  // right looks like" when the real problem is a fence, not missing
  // markers.
  const unterminatedFenceLine = findUnterminatedFence(lines);
  const confidence = (unterminatedFenceLine !== null || ratio < LOW_CONFIDENCE_RATIO) ? 'low' : 'high';
  const guidance = unterminatedFenceLine !== null
    ? unterminatedFenceGuidance(filePath, unterminatedFenceLine)
    : (confidence === 'low' ? markupGuidance(filePath, totalBlocks, markedBlocks) : null);
  return {
    claims,
    coverage: {
      extracted: claims.length,
      markedBlocks,
      totalBlocks,
      confidence,
      guidance,
    },
  };
}
