export type BranchValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "branch-name-empty"
        | "branch-has-whitespace"
        | "branch-has-bad-char"
        | "branch-needs-jira-pattern";
    };

const JIRA_RE = /^[A-Z]+-[0-9]+/;
const BAD_CHARS_RE = /[\s/~^:?*[\\]/;
const DOUBLE_DOT_RE = /\.\./;

export function validateBranchName(
  name: string,
  opts: { requireJiraPattern: boolean }
): BranchValidationResult {
  if (!name) return { ok: false, reason: "branch-name-empty" };
  if (/\s/.test(name)) return { ok: false, reason: "branch-has-whitespace" };
  if (BAD_CHARS_RE.test(name) || DOUBLE_DOT_RE.test(name) || name.endsWith(".")) {
    return { ok: false, reason: "branch-has-bad-char" };
  }
  if (opts.requireJiraPattern && !JIRA_RE.test(name)) {
    return { ok: false, reason: "branch-needs-jira-pattern" };
  }
  return { ok: true };
}
