// An unwritten section is not a claim — there is nothing to check — so it gets
// no verdict and no shape. It is a property of the document, counted separately
// and reported on its own line.
export const STUB_RE = /^\s*\*\*Unwritten:\*\*\s*(.+)$/i;

export function findStubs(markdown) {
  const out = [];
  const lines = String(markdown).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(STUB_RE);
    if (m) out.push({ question: m[1].trim(), line: i + 1 });
  }
  return out;
}
