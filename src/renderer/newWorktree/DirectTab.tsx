import { useState } from "react";
import { validateBranchName } from "@shared/branchValidation";
import { Label } from "../ui";

type Props = {
  requireJiraPattern: boolean;
  busy: boolean;
  submitError: string | null;
  onSubmit: (branch: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void;
};

const REASON_TEXT: Record<string, string> = {
  "branch-name-empty": "Branch name is required.",
  "branch-has-whitespace": "Branch name cannot contain spaces.",
  "branch-has-bad-char": "Branch name has invalid characters.",
  "branch-needs-jira-pattern": "Branch must start with a Jira ticket (e.g. PROJ-123-...).",
};

export function DirectTab({
  requireJiraPattern,
  busy,
  submitError,
  onSubmit,
  onCancel,
}: Props): React.JSX.Element {
  const [branch, setBranch] = useState("");
  const v = validateBranchName(branch, { requireJiraPattern });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.ok) void onSubmit(branch);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="direct-branch">Branch Name</Label>
        <input
          id="direct-branch"
          className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft h-10 rounded-md border px-3 font-mono text-base focus:outline-2"
          placeholder={requireJiraPattern ? "PROJ-123-feat-add-search" : "feat-add-search"}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          autoFocus
          disabled={busy}
        />
        <span className="text-text-muted text-xs">
          Creates in the configured worktree directory.
        </span>
        {!v.ok && branch.length > 0 && (
          <span className="text-destructive text-xs">{REASON_TEXT[v.reason]}</span>
        )}
        {submitError && (
          <span className="text-destructive text-xs">Cannot create worktree. {submitError}</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!v.ok || busy}
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}
