// Venue is where the claim's READER stands, not what the claim says. A
// runbook reader has a shell; a client reading a served tool description
// does not, so "run this command" is meaningless to them.
export function determineVenue(filePath) {
  return /\.(md|markdown|rst|txt)$/i.test(filePath) ? 'executable' : 'static';
}
