import { useEffect, useState } from "react";
import { validateBranchName } from "@shared/branchValidation";
import { Label } from "../ui";

type Props = {
  requireJiraPattern: boolean;
  busy: boolean;
  submitError: string | null;
  onSubmit: (branch: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onBranchPreviewChange?: (branch: string) => void;
  onCanCreateChange?: (canCreate: boolean) => void;
  onRequestSubmitChange?: (submit: (() => void) | null) => void;
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
  onBranchPreviewChange,
  onCanCreateChange,
  onRequestSubmitChange,
}: Props): React.JSX.Element {
  const [branch, setBranch] = useState("");
  const v = validateBranchName(branch, { requireJiraPattern });

  useEffect(() => {
    onBranchPreviewChange?.(branch);
  }, [branch, onBranchPreviewChange]);

  useEffect(() => {
    onCanCreateChange?.(v.ok && !busy);
  }, [busy, onCanCreateChange, v.ok]);

  useEffect(() => {
    if (!v.ok || busy) {
      onRequestSubmitChange?.(null);
      return;
    }
    onRequestSubmitChange?.(() => {
      void onSubmit(branch);
    });
    return () => onRequestSubmitChange?.(null);
  }, [branch, busy, onRequestSubmitChange, onSubmit, v.ok]);

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
        {!v.ok && branch.length > 0 && (
          <span className="text-destructive text-xs">{REASON_TEXT[v.reason]}</span>
        )}
        {submitError && (
          <span className="text-destructive text-xs">Cannot create worktree. {submitError}</span>
        )}
      </div>
    </form>
  );
}
