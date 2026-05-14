import { useRef } from "react";
import { Terminal } from "lucide-react";
import { Card } from "../card/Card";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useFocusWorkbench } from "../state/focusWorkbench";
import { useRepos } from "../state/repos";
import { useTerminalSessionCards } from "../state/terminalSessions";
import { useWorktrees } from "../state/worktrees";
import { FocusWorkbench } from "./FocusWorkbench";

export function Focus(): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const { worktrees, activeId, setActive } = useWorktrees();
  const { isOpen, openOrFocus } = useTerminalSessionCards();
  const { terminalPanePercent, isResizingFocusPanes, startFocusPaneResize } = useFocusWorkbench();
  const splitRef = useRef<HTMLDivElement>(null);
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

  const workbenchPanePercent = 100 - terminalPanePercent;

  return (
    <div ref={splitRef} className="relative flex h-full min-h-0 flex-row p-3">
      <div
        className="flex min-h-0 min-w-0 shrink pr-2"
        data-focus-pane="terminal"
        style={{ flexBasis: `${terminalPanePercent}%` }}
      >
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
      <div
        role="separator"
        aria-label="Resize focus panes"
        aria-orientation="vertical"
        aria-valuemax={75}
        aria-valuemin={25}
        aria-valuenow={Math.round(terminalPanePercent)}
        className={cn(
          "group flex h-full w-2 shrink-0 cursor-col-resize items-stretch justify-center",
          !isResizingFocusPanes && "transition-colors duration-150"
        )}
        onMouseDown={(event) => {
          if (splitRef.current) startFocusPaneResize(event, splitRef.current);
        }}
      >
        <span
          aria-hidden="true"
          className={cn(
            "bg-border-strong group-hover:bg-elevated pointer-events-none h-full w-px transition-colors duration-150",
            isResizingFocusPanes && "bg-accent"
          )}
        />
      </div>
      <div
        className="flex min-h-0 min-w-0 shrink pl-2"
        data-focus-pane="workbench"
        style={{ flexBasis: `${workbenchPanePercent}%` }}
      >
        <FocusWorkbench />
      </div>
      <div className="border-border-subtle bg-surface/70 text-text-muted pointer-events-none absolute top-3 right-4 rounded-sm border px-2 py-1 text-xs">
        <kbd>Cmd .</kbd> Overview
      </div>
    </div>
  );
}
