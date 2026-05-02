import { useEffect, useState } from "react";
import { Dialog, Tabs } from "../ui";
import { DirectTab } from "./DirectTab";
import { JiraTab } from "./JiraTab";
import { useRepos } from "../state/repos";
import { api } from "../ipc/api";

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
  const [tab, setTab] = useState<"jira" | "direct">("direct");
  const [requireJira, setRequireJira] = useState(false);
  const [busy, setBusy] = useState(false);
  const [directSubmitError, setDirectSubmitError] = useState<string | null>(null);
  const [jiraSubmitError, setJiraSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !repo) return;
    setDirectSubmitError(null);
    setJiraSubmitError(null);
    void (async () => {
      const r = await api.config.get({ repoPath: repo.path });
      if (r.ok) setRequireJira(r.value.config.branchValidation?.requireJiraPattern ?? false);
    })();
  }, [open, repo]);

  if (!repo) return null;

  async function submitDirect(branch: string): Promise<SubmitResult> {
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
  }

  async function submitJira(branch: string): Promise<SubmitResult> {
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
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen || busy) return;
        onClose();
      }}
    >
      <Dialog.Content size="normal">
        <Dialog.Header>
          <Dialog.Title>New Worktree</Dialog.Title>
          <Dialog.Close disabled={busy} />
        </Dialog.Header>
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as "jira" | "direct")}>
          <Tabs.List>
            <Tabs.Trigger value="direct">Direct</Tabs.Trigger>
            <Tabs.Trigger value="jira">From Jira</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="direct">
            <DirectTab
              requireJiraPattern={requireJira}
              busy={busy}
              submitError={directSubmitError}
              onSubmit={submitDirect}
              onCancel={onClose}
            />
          </Tabs.Content>
          <Tabs.Content value="jira">
            <JiraTab
              busy={busy}
              requireJiraPattern={requireJira}
              submitError={jiraSubmitError}
              onSubmit={submitJira}
              onCancel={onClose}
              onClearSubmitError={() => setJiraSubmitError(null)}
              onOpenSettings={() => {
                onClose();
                window.dispatchEvent(new CustomEvent("app:open-settings"));
              }}
            />
          </Tabs.Content>
        </Tabs.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}
