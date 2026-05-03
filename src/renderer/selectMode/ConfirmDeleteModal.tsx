import { useState } from "react";

import { Dialog } from "../ui";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { useSelectMode } from "../state/selectMode";
import { useWorktrees } from "../state/worktrees";
import { useToast } from "../state/toast";

type Props = { open: boolean; onClose: () => void };

export function ConfirmDeleteModal({ open, onClose }: Props): React.JSX.Element | null {
  const [starting, setStarting] = useState(false);
  const sm = useSelectMode();
  const { repos, activeRepoId } = useRepos();
  const { worktrees } = useWorktrees();
  const toast = useToast();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  if (!repo) return null;
  const targets = worktrees.filter((w) => sm.selected.has(w.path) && !w.isMain);

  async function confirm(): Promise<void> {
    if (targets.length === 0) return;
    if (starting) return;
    if (!repo) return;

    setStarting(true);
    try {
      const result = await api.worktreeDelete.start({
        repoId: repo.id,
        targets: targets.map(({ path, branch }) => ({ worktreePath: path, branch })),
      });
      if (!result.ok) {
        toast.push({
          kind: "error",
          title: "Failed to start delete job",
          description: result.error.message,
          durationMs: 5000,
        });
        return;
      }
      sm.exit();
      onClose();
      toast.push({
        kind: "progress",
        title: `Deleting ${targets.length} ${targets.length === 1 ? "worktree" : "worktrees"}`,
        description: "Progress is shown in Background Jobs.",
        durationMs: 3000,
      });
    } catch (error) {
      toast.push({
        kind: "error",
        title: "Failed to start delete job",
        description: error instanceof Error ? error.message : "Unexpected delete job start failure",
        durationMs: 5000,
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(openNext) => !openNext && !starting && onClose()}>
      <Dialog.Content size="normal">
        <Dialog.Title>
          Force delete {targets.length} worktree{targets.length === 1 ? "" : "s"}?
        </Dialog.Title>
        <ul className="text-text-secondary list-none space-y-1 p-0 text-sm">
          {targets.map((t) => (
            <li key={t.path}>{t.branch ?? t.path}</li>
          ))}
        </ul>
        <div className="text-text-muted text-xs">
          Runs <code>git worktree remove --force</code> + <code>rm -rf</code>. Uncommitted changes
          will be lost.
        </div>
        <Dialog.Footer>
          <button
            disabled={starting}
            className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={targets.length === 0 || starting}
            aria-busy={starting}
            className="bg-destructive text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void confirm()}
          >
            {starting ? "Starting..." : "Force Delete"}
          </button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
