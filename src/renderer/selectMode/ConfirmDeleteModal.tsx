import { useState } from "react";

import { Dialog } from "../ui";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { useSelectMode } from "../state/selectMode";
import { useWorktrees } from "../state/worktrees";
import { useToast } from "../state/toast";

type Props = { open: boolean; onClose: () => void };

export function ConfirmDeleteModal({ open, onClose }: Props): React.JSX.Element | null {
  const [deleting, setDeleting] = useState(false);
  const sm = useSelectMode();
  const { repos, activeRepoId } = useRepos();
  const { worktrees, refresh } = useWorktrees();
  const toast = useToast();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  if (!repo) return null;
  const targets = worktrees.filter((w) => sm.selected.has(w.path) && !w.isMain);

  async function confirm(): Promise<void> {
    if (targets.length === 0) return;
    if (deleting) return;
    if (!repo) return;

    setDeleting(true);
    const deletedPaths: string[] = [];
    let attemptIndex = 0;
    try {
      for (const [index, t] of targets.entries()) {
        attemptIndex = index;
        const r = await api.worktree.remove({ repoPath: repo.path, worktreePath: t.path });
        if (!r.ok) {
          if (deletedPaths.length > 0) {
            const retryPaths = targets.slice(index).map((target) => target.path);
            await refresh();
            sm.selectAll(retryPaths);
          }
          toast.push({
            kind: "error",
            title: "Failed to delete worktree",
            description: r.error.message,
            durationMs: 5000,
          });
          return;
        }
        deletedPaths.push(t.path);
      }
      await refresh();
      sm.exit();
      onClose();
      toast.push({
        kind: "success",
        title: `Deleted ${targets.length} worktree(s)`,
        durationMs: 3000,
      });
    } catch (error) {
      if (deletedPaths.length > 0) {
        const deletedPathSet = new Set(deletedPaths);
        const retryPaths = targets
          .slice(attemptIndex)
          .map((target) => target.path)
          .filter((path) => !deletedPathSet.has(path));
        await refresh();
        sm.selectAll(retryPaths);
      }
      toast.push({
        kind: "error",
        title: "Failed to delete worktree",
        description: error instanceof Error ? error.message : "Unexpected delete failure",
        durationMs: 5000,
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !deleting && onClose()}>
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
            disabled={deleting}
            className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={targets.length === 0 || deleting}
            aria-busy={deleting}
            className="bg-destructive text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void confirm()}
          >
            {deleting ? "Deleting..." : "Force Delete"}
          </button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
