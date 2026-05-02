import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { PreflightNotice } from "./PreflightNotice";
import { validateBranchName } from "@shared/branchValidation";
import { Tooltip, Label } from "../ui";

type Props = {
  busy: boolean;
  requireJiraPattern: boolean;
  submitError: string | null;
  onSubmit: (branch: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void;
  onClearSubmitError: () => void;
  onOpenSettings: () => void;
};

function JiraActions({
  busy,
  canCreate,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  canCreate: boolean;
  onCancel: () => void;
  onCreate: () => void;
}): React.JSX.Element {
  return (
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
        type="button"
        className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canCreate || busy}
        onClick={onCreate}
      >
        {busy ? "Creating..." : "Create"}
      </button>
    </div>
  );
}

export function JiraTab({
  busy,
  requireJiraPattern,
  submitError,
  onSubmit,
  onCancel,
  onClearSubmitError,
  onOpenSettings,
}: Props): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const [jiraEnabled, setJiraEnabled] = useState<boolean | null>(null);
  const [tokenPresent, setTokenPresent] = useState<boolean | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [resolved, setResolved] = useState<{
    ticketKey: string;
    summary: string;
    branch: string;
  } | null>(null);
  const [editingBranch, setEditingBranch] = useState(false);
  const [draftBranch, setDraftBranch] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!activeRepoId) return;
    void (async () => {
      const all = await api.repo.list();
      if (!all.ok) return;
      const r = all.value.repos.find((x) => x.id === activeRepoId);
      if (!r) return;
      const c = await api.config.get({ repoPath: r.path });
      if (c.ok && c.value.config.jira?.enabled) {
        setJiraEnabled(true);
        const t = await api.secrets.get({ key: c.value.config.jira.tokenKeychainKey });
        setTokenPresent(t.ok ? t.value.value !== null : false);
      } else {
        setJiraEnabled(false);
        setTokenPresent(false);
      }
    })();
  }, [activeRepoId]);

  if (jiraEnabled === false || tokenPresent === false) {
    return (
      <div className="flex flex-col gap-4">
        <PreflightNotice onOpenSettings={onOpenSettings} />
        <JiraActions
          busy={busy}
          canCreate={false}
          onCancel={onCancel}
          onCreate={() => undefined}
        />
      </div>
    );
  }
  if (jiraEnabled === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-text-muted">Loading...</div>
        <JiraActions
          busy={busy}
          canCreate={false}
          onCancel={onCancel}
          onCreate={() => undefined}
        />
      </div>
    );
  }

  async function resolve(): Promise<void> {
    if (!activeRepoId || !ticketInput) return;
    setResolving(true);
    setResolveError(null);
    onClearSubmitError();
    const r = await api.jira.resolve({ repoId: activeRepoId, ticketInput });
    setResolving(false);
    if (!r.ok) {
      setResolveError(r.error.message);
      return;
    }
    setResolved({
      ticketKey: r.value.ticketKey,
      summary: r.value.summary,
      branch: r.value.suggestedBranch,
    });
    setDraftBranch(r.value.suggestedBranch);
  }

  const branchValue = editingBranch ? draftBranch : (resolved?.branch ?? "");
  const branchValid = validateBranchName(branchValue, { requireJiraPattern });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="jira-ticket">Jira Ticket (URL or ID)</Label>
        <div className="flex gap-2">
          <input
            id="jira-ticket"
            className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft h-10 min-w-0 flex-1 rounded-md border px-3 font-mono text-base focus:outline-2"
            placeholder="https://x.atlassian.net/browse/PROJ-123"
            value={ticketInput}
            onChange={(e) => {
              setTicketInput(e.target.value);
              onClearSubmitError();
            }}
            disabled={busy || resolving}
          />
          <button
            type="button"
            className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void resolve()}
            disabled={!ticketInput || resolving || busy}
          >
            {resolving ? "Resolving..." : "Resolve"}
          </button>
        </div>
        {resolveError && <span className="text-destructive text-xs">{resolveError}</span>}
      </div>

      {resolved && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="jira-branch">Branch Preview</Label>
          <div className="flex items-center gap-2">
            <input
              id="jira-branch"
              className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft h-10 min-w-0 flex-1 rounded-md border px-3 font-mono text-base focus:outline-2"
              value={branchValue}
              readOnly={!editingBranch}
              onChange={(e) => {
                setDraftBranch(e.target.value);
                onClearSubmitError();
              }}
              disabled={busy}
            />
            <Tooltip label="Edit branch name">
              <button
                aria-label="Edit branch name"
                type="button"
                className="text-text-secondary hover:bg-elevated inline-flex h-10 w-10 items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setEditingBranch(true)}
                disabled={busy}
              >
                <Icon icon={Pencil} size={12} />
              </button>
            </Tooltip>
          </div>
          {!branchValid.ok && (
            <span className="text-destructive text-xs">Invalid branch name.</span>
          )}
          {submitError && (
            <span className="text-destructive text-xs">Cannot create worktree. {submitError}</span>
          )}
          <span className="text-text-muted text-xs">{resolved.summary}</span>
        </div>
      )}

      <JiraActions
        busy={busy}
        canCreate={!!resolved && branchValid.ok}
        onCancel={onCancel}
        onCreate={() => (resolved && branchValid.ok ? void onSubmit(branchValue) : undefined)}
      />
    </div>
  );
}
