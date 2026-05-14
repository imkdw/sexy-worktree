import { Terminal } from "lucide-react";
import { Card } from "../card/Card";
import { Icon } from "../icons/Icon";
import { useRepos } from "../state/repos";
import { useTerminalSessionCards } from "../state/terminalSessions";
import { useWorktrees } from "../state/worktrees";
import { FocusWorkbench } from "./FocusWorkbench";

export function Focus(): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const { worktrees, activeId, setActive } = useWorktrees();
  const { isOpen, openOrFocus } = useTerminalSessionCards();
  const wt = worktrees.find((w) => w.path === activeId) ?? null;

  if (!activeRepoId) {
    return (
      <div className="text-text-faint flex flex-1 items-center justify-center">
        No worktree selected.
      </div>
    );
  }

  if (!wt) {
    return (
      <div className="text-text-faint flex flex-1 items-center justify-center">
        No worktree selected.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-row gap-3 p-3">
      <div className="flex min-h-0 min-w-0 flex-1 basis-1/2">
        {isOpen(activeRepoId, wt.path) ? (
          <Card
            repoId={activeRepoId}
            branch={wt.branch ?? "(detached)"}
            cwd={wt.path}
            active={true}
            onActivate={() => setActive(wt.path)}
          />
        ) : (
          <div className="border-border-subtle bg-surface text-text-muted flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md border p-6 text-center">
            <Icon icon={Terminal} size={20} />
            <div className="text-text-secondary text-sm font-medium">Terminal is closed</div>
            <button
              className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium"
              onClick={() => openOrFocus(activeRepoId, wt.path)}
            >
              Open Terminal
            </button>
          </div>
        )}
      </div>
      <FocusWorkbench />
      <div className="border-border-subtle bg-surface/70 text-text-muted pointer-events-none absolute top-3 right-4 rounded-sm border px-2 py-1 text-xs">
        <kbd>Cmd .</kbd> Overview
      </div>
    </div>
  );
}
