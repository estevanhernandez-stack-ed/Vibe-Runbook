// Markers a runbook may use to flag a checkable claim. Este's habit is the
// seed set; the honesty gate in Task 2 is what keeps unmarked docs truthful.
const MARKERS = [
  { name: 'right', re: /^\s*\*\*Right(?:,[^*]*)?:\*\*\s*(.+)$/i },
  { name: 'wrong', re: /^\s*\*\*Wrong[^*]*:\*\*\s*(.+)$/i },
  { name: 'expect', re: /^\s*\*\*(?:Expected|Should)[^*]*:\*\*\s*(.+)$/i },
];

// A bolded or backticked label-value pair, e.g. "**Revision `star-00049-j5r`**"
// or "HEAD `0855bd2`" — the highest-value claims in a real runbook live in its
// opening blockquote with no **Right:**/**Wrong:** marker at all. Over-extraction
// here is fine: a later task's classifier routes anything it can't identify to
// `unknown`, which reports as a QUESTION rather than a false failure.
const PREAMBLE_PATTERNS = [
  /\*\*[^*]+\*\*/g,
  /`[^`]+`/g,
];

function isBlockquoteLine(line) {
  return /^\s*>/.test(line);
}

function stripBlockquotePrefix(line) {
  return line.replace(/^\s*>\s?/, '');
}

export function extractClaims(markdown, filePath) {
  const lines = markdown.split(/\r?\n/);
  const claims = [];
  let totalBlocks = 0;
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
    for (let i = 0; i <= preambleEnd; i += 1) {
      const raw = lines[i];
      if (!isBlockquoteLine(raw)) continue;
      const content = stripBlockquotePrefix(raw);
      const seenOnLine = new Set();
      for (const pattern of PREAMBLE_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(content)) !== null) {
          const text = m[0].trim();
          if (!text || seenOnLine.has(text)) continue;
          seenOnLine.add(text);
          n += 1;
          claims.push({
            id: `c-${String(n).padStart(3, '0')}`,
            source: { file: filePath, line: i + 1 },
            text,
            marker: 'preamble',
          });
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (/^\s*(#{1,6})\s/.test(line)) continue;
    totalBlocks += 1;

    for (const marker of MARKERS) {
      const m = line.match(marker.re);
      if (!m) continue;
      markedBlocks += 1;
      n += 1;
      claims.push({
        id: `c-${String(n).padStart(3, '0')}`,
        source: { file: filePath, line: i + 1 },
        text: m[1].trim(),
        marker: marker.name,
      });
      break;
    }
  }

  return { claims, coverage: { extracted: claims.length, markedBlocks, totalBlocks } };
}
