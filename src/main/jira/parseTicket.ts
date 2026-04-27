const KEY_RE = /([A-Z]+-\d+)/;

export function parseJiraTicket(input: string): { key: string } | null {
  const trimmed = input.trim();
  const m = trimmed.match(KEY_RE);
  if (!m) return null;
  return { key: m[1]! };
}
