import { Card } from "../card/Card";
import { useRepos } from "../state/repos";
import { useWorktrees } from "../state/worktrees";

export function Focus(): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const { worktrees, activeId, setActive } = useWorktrees();
  const wt = worktrees.find((w) => w.path === activeId) ?? null;
  if (!activeRepoId || !wt)
    return (
      <div className="text-text-faint flex flex-1 items-center justify-center">
        No worktree selected.
      </div>
    );
  return (
    <div className="flex h-full p-3">
      <Card
        repoId={activeRepoId}
        branch={wt.branch ?? "(detached)"}
        cwd={wt.path}
        active={true}
        onActivate={() => setActive(wt.path)}
      />
      <div className="border-border-subtle bg-surface/70 text-text-muted pointer-events-none absolute top-[calc(var(--titlebar-h)+var(--tabbar-h)+var(--toolbar-h)+var(--spacing-3))] right-4 rounded-sm border px-2 py-1 text-xs">
        <kbd>⌘.</kbd> Overview
      </div>
    </div>
  );
}
