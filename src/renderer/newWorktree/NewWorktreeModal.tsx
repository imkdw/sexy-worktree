import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Icon } from "../icons/Icon";
import { DirectTab } from "./DirectTab";
import { JiraTab } from "./JiraTab";
import { useRepos } from "../state/repos";
import { api } from "../ipc/api";
import { useToast } from "../state/toast";
import { cn } from "../lib/cn";

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

  if (!open || !repo) return null;

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
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-modal border-border-subtle bg-surface flex max-w-[95vw] flex-col gap-4 rounded-lg border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="text-text-primary text-lg font-semibold">New Worktree</span>
          <button onClick={onClose}>
            <Icon icon={X} size={16} />
          </button>
        </div>
        <div className="border-border-subtle flex gap-3 border-b">
          <span
            className={cn(
              "text-text-muted border-b-2 border-transparent py-2 text-sm",
              tab === "jira" && "border-accent text-text-primary"
            )}
            onClick={() => setTab("jira")}
          >
            From Jira
          </span>
          <span
            className={cn(
              "text-text-muted border-b-2 border-transparent py-2 text-sm",
              tab === "direct" && "border-accent text-text-primary"
            )}
            onClick={() => setTab("direct")}
          >
            Direct
          </span>
        </div>
        {tab === "direct" && (
          <DirectTab requireJiraPattern={requireJira} busy={busy} onSubmit={submit} />
        )}
        {tab === "jira" && (
          <JiraTab
            busy={busy}
            requireJiraPattern={requireJira}
            onSubmit={submit}
            onOpenSettings={() => {
              onClose();
              window.dispatchEvent(new CustomEvent("app:open-settings"));
            }}
          />
        )}
      </div>
    </div>
  );
}
