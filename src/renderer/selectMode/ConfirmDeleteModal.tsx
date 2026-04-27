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
  if (!open || !repo) return null;
  const targets = worktrees.filter((w) => sm.selected.has(w.path) && !w.isMain);

  async function confirm(): Promise<void> {
    if (!repo) return;
    for (const t of targets) {
      await api.worktree.remove({ repoPath: repo.path, worktreePath: t.path });
    }
    await refresh();
    sm.exit();
    onClose();
    toast.push({
      kind: "success",
      title: `Deleted ${targets.length} worktree(s)`,
      durationMs: 3000,
    });
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
        <span className="text-text-primary text-lg font-semibold">
          Force delete {targets.length} worktree{targets.length === 1 ? "" : "s"}?
        </span>
        <ul className="text-text-secondary pl-4 text-sm">
          {targets.map((t) => (
            <li key={t.path}>{t.branch ?? t.path}</li>
          ))}
        </ul>
        <div className="text-text-muted text-xs">
          Runs <code>git worktree remove --force</code> + <code>rm -rf</code>. Uncommitted changes
          will be lost.
        </div>
        <div className="flex justify-end gap-3">
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
        </div>
      </div>
    </div>
  );
}
