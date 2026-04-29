import { useEffect, useState } from "react";
import { Dialog, Tabs } from "../ui";
import { DirectTab } from "./DirectTab";
import { JiraTab } from "./JiraTab";
import { useRepos } from "../state/repos";
import { api } from "../ipc/api";
import { useToast } from "../state/toast";

type Props = { open: boolean; onClose: () => void };

export function NewWorktreeModal({ open, onClose }: Props): React.JSX.Element | null {
  const { repos, activeRepoId } = useRepos();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  const [tab, setTab] = useState<"jira" | "direct">("direct");
  const [requireJira, setRequireJira] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open || !repo) return;
    void (async () => {
      const r = await api.config.get({ repoPath: repo.path });
      if (r.ok) setRequireJira(r.value.config.branchValidation?.requireJiraPattern ?? false);
    })();
  }, [open, repo]);

  if (!repo) return null;

  async function submit(branch: string): Promise<void> {
    if (!repo) return;
    setBusy(true);
    try {
      const r = await api.newWorktree.create({ repoId: repo.id, branch });
      if (r.ok) onClose();
      else
        toast.push({
          kind: "error",
          title: "Failed to create worktree",
          description: JSON.stringify(r.error),
          durationMs: 5000,
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content size="normal">
        <Dialog.Header>
          <Dialog.Title>New Worktree</Dialog.Title>
          <Dialog.Close />
        </Dialog.Header>
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as "jira" | "direct")}>
          <Tabs.List>
            <Tabs.Trigger value="direct">Direct</Tabs.Trigger>
            <Tabs.Trigger value="jira">From Jira</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="direct">
            <DirectTab requireJiraPattern={requireJira} busy={busy} onSubmit={submit} />
          </Tabs.Content>
          <Tabs.Content value="jira">
            <JiraTab
              busy={busy}
              requireJiraPattern={requireJira}
              onSubmit={submit}
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
