/**
 * Formats an ISO-8601 timestamp string into a concise, human-readable UTC/local string.
 */
export function formatTimestamp(isoString: string | null): string {
  if (!isoString) {
    return 'Not yet checked';
  }
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  return parsed.toISOString().replace('T', ' ').replace('Z', ' UTC');
}
