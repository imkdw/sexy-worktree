import { Dialog } from "../ui";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { useSelectMode } from "../state/selectMode";
import { useWorktrees } from "../state/worktrees";
import { useToast } from "../state/toast";

type Props = { open: boolean; onClose: () => void };

export function ConfirmDeleteModal({ open, onClose }: Props): React.JSX.Element | null {
  const sm = useSelectMode();
  const { repos, activeRepoId } = useRepos();
  const { worktrees, refresh } = useWorktrees();
  const toast = useToast();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  if (!repo) return null;
  const targets = worktrees.filter((w) => sm.selected.has(w.path) && !w.isMain);

  async function confirm(): Promise<void> {
    if (!repo) return;
    for (const t of targets) {
      await api.worktree.remove({ repoPath: repo.path, worktreePath: t.path });
    }
    await refresh();
    sm.clear();
    onClose();
    toast.push({
      kind: "success",
      title: `Deleted ${targets.length} worktree(s)`,
      durationMs: 3000,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content size="normal">
        <Dialog.Title>
          Force delete {targets.length} worktree{targets.length === 1 ? "" : "s"}?
        </Dialog.Title>
        <ul className="text-text-secondary pl-4 text-sm">
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
            className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="bg-destructive text-background rounded-sm px-3 py-2 text-sm font-medium"
            onClick={() => void confirm()}
          >
            Force Delete
          </button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
