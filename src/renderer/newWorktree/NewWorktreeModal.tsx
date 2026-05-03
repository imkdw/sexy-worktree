import { useCallback, useEffect, useState } from "react";
import { Dialog } from "../ui";
import { WorktreeMethodSelector, type WorktreeMethod } from "./WorktreeMethodSelector";
import { DirectTab } from "./DirectTab";
import { JiraTab } from "./JiraTab";
import { useRepos } from "../state/repos";
import { api } from "../ipc/api";
import type { RepoConfigDto } from "@shared/ipc";
import { WorktreeCreateSummary } from "./WorktreeCreateSummary";

type Props = { open: boolean; onClose: () => void };

type SubmitResult = { ok: true } | { ok: false; message: string };

type CreateError = Extract<
  Awaited<ReturnType<typeof api.newWorktree.create>>,
  { ok: false }
>["error"];

function createErrorMessage(error: CreateError): string {
  if (error.kind === "invalid-branch") return `Invalid branch name: ${error.reason}`;
  if (error.kind === "duplicate") {
    return `A worktree is already being created for this branch or path: ${error.existingPath}`;
  }
  return error.message;
}

export function NewWorktreeModal({ open, onClose }: Props): React.JSX.Element | null {
  const { repos, activeRepoId } = useRepos();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  const [method, setMethod] = useState<WorktreeMethod>("direct");
  const [requireJira, setRequireJira] = useState(false);
  const [busy, setBusy] = useState(false);
  const [directSubmitError, setDirectSubmitError] = useState<string | null>(null);
  const [jiraSubmitError, setJiraSubmitError] = useState<string | null>(null);
  const [repoConfig, setRepoConfig] = useState<RepoConfigDto | null>(null);
  const [branchPreview, setBranchPreview] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [requestSubmit, setRequestSubmit] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!open || !repo) return;
    setDirectSubmitError(null);
    setJiraSubmitError(null);
    setBranchPreview("");
    setCanCreate(false);
    setRequestSubmit(null);
    void (async () => {
      const r = await api.config.get({ repoPath: repo.path });
      if (!r.ok) return;
      setRepoConfig(r.value.config);
      setRequireJira(r.value.config.branchValidation?.requireJiraPattern ?? false);
    })();
  }, [open, repo]);

  const handleRequestSubmitChange = useCallback((submit: (() => void) | null) => {
    setRequestSubmit(submit ? () => submit : null);
  }, []);

  const submitDirect = useCallback(
    async (branch: string): Promise<SubmitResult> => {
      if (!repo) return { ok: false, message: "No active repository." };
      setBusy(true);
      setDirectSubmitError(null);
      try {
        const r = await api.newWorktree.create({ repoId: repo.id, branch });
        if (r.ok) {
          onClose();
          return { ok: true };
        }
        const message = createErrorMessage(r.error);
        setDirectSubmitError(message);
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [onClose, repo]
  );

  const submitJira = useCallback(
    async (branch: string): Promise<SubmitResult> => {
      if (!repo) return { ok: false, message: "No active repository." };
      setBusy(true);
      setJiraSubmitError(null);
      try {
        const r = await api.newWorktree.create({ repoId: repo.id, branch });
        if (r.ok) {
          onClose();
          return { ok: true };
        }
        const message = createErrorMessage(r.error);
        setJiraSubmitError(message);
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [onClose, repo]
  );

  if (!repo) return null;

  function changeMethod(nextMethod: WorktreeMethod): void {
    if (nextMethod === method) return;
    setMethod(nextMethod);
    setBranchPreview("");
    setCanCreate(false);
    setRequestSubmit(null);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen || busy) return;
        onClose();
      }}
    >
      <Dialog.Content size="wide">
        <div className="flex flex-col gap-6">
          <Dialog.Header>
            <div className="flex min-w-0 flex-col gap-1">
              <Dialog.Title>New Worktree</Dialog.Title>
              <Dialog.Description>Choose how to name the branch, then create.</Dialog.Description>
            </div>
            <Dialog.Close disabled={busy} />
          </Dialog.Header>

          <WorktreeMethodSelector value={method} onChange={changeMethod} disabled={busy} />

          {method === "direct" ? (
            <DirectTab
              requireJiraPattern={requireJira}
              busy={busy}
              submitError={directSubmitError}
              onSubmit={submitDirect}
              onBranchPreviewChange={setBranchPreview}
              onCanCreateChange={setCanCreate}
              onRequestSubmitChange={handleRequestSubmitChange}
            />
          ) : (
            <JiraTab
              busy={busy}
              requireJiraPattern={requireJira}
              submitError={jiraSubmitError}
              onSubmit={submitJira}
              onClearSubmitError={() => setJiraSubmitError(null)}
              onOpenSettings={() => {
                onClose();
                window.dispatchEvent(new CustomEvent("app:open-settings"));
              }}
              onBranchPreviewChange={setBranchPreview}
              onCanCreateChange={setCanCreate}
              onRequestSubmitChange={handleRequestSubmitChange}
            />
          )}

          <WorktreeCreateSummary config={repoConfig} branchPreview={branchPreview} />

          <Dialog.Footer>
            <button
              type="button"
              className="text-text-secondary hover:bg-elevated rounded-sm px-4 py-3 text-base disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bg-accent text-background rounded-sm px-4 py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canCreate || busy || requestSubmit === null}
              onClick={() => requestSubmit?.()}
            >
              {busy ? "Creating..." : "Create Worktree"}
            </button>
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
