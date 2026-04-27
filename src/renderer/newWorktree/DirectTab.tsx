import { useState } from "react";
import { validateBranchName } from "@shared/branchValidation";

type Props = {
  requireJiraPattern: boolean;
  busy: boolean;
  onSubmit: (branch: string) => Promise<void>;
};

const REASON_TEXT: Record<string, string> = {
  "branch-name-empty": "Branch name is required.",
  "branch-has-whitespace": "Branch name cannot contain spaces.",
  "branch-has-bad-char": "Branch name has invalid characters.",
  "branch-needs-jira-pattern": "Branch must start with a Jira ticket (e.g. PROJ-123-...).",
};

export function DirectTab({ requireJiraPattern, busy, onSubmit }: Props): React.JSX.Element {
  const [branch, setBranch] = useState("");
  const v = validateBranchName(branch, { requireJiraPattern });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.ok) void onSubmit(branch);
      }}
    >
      <span className="text-text-muted text-xs tracking-[0.04em] uppercase">Branch Name</span>
      <input
        className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2"
        placeholder={requireJiraPattern ? "PROJ-123-feat-add-search" : "feat-add-search"}
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        autoFocus
      />
      {!v.ok && branch.length > 0 && (
        <span className="text-destructive text-xs">{REASON_TEXT[v.reason]}</span>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="submit"
          className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!v.ok || busy}
        >
          Confirm
        </button>
      </div>
    </form>
  );
}
