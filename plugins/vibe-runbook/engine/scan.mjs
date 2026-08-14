import { extractClaims } from './extract.mjs';
import { classifyShape } from './classify.mjs';
import { parseCost } from './cost.mjs';
import { determineVenue } from './venue.mjs';

export const SCHEMA_VERSION = '1.0.0';

// The nearest preceding heading owns a claim's cost annotation, because that
// is where a runbook writes it.
function headingAbove(lines, lineNumber) {
  for (let i = lineNumber - 1; i >= 0; i -= 1) {
    if (/^\s*#{1,6}\s/.test(lines[i])) return lines[i];
  }
  return '';
}

export function scanRunbook(markdown, filePath) {
  const lines = markdown.split(/\r?\n/);
  const { claims, coverage } = extractClaims(markdown, filePath);
  const venue = determineVenue(filePath);

  const enriched = claims.map((c) => {
    const shape = classifyShape(c.text);
    return {
      ...c,
      shape: shape.shape,
      confidence: shape.confidence,
      classifierRule: shape.rule,
      venue,
      cost: parseCost(headingAbove(lines, c.source.line)),
      verdict: null,
      evidence: null,
      checkedAt: null,
    };
  });

  return { schemaVersion: SCHEMA_VERSION, runbook: filePath, coverage, claims: enriched };
}
