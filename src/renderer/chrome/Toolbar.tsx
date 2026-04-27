import { LayoutGrid, Maximize2, Plus, CheckSquare } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useSelectMode } from "../state/selectMode";

type Mode = "overview" | "focus";

type ToolbarProps = {
  repoPath: string;
  worktreeCount: number;
  mode: Mode;
  onModeChange?: (m: Mode) => void;
  onNewWorktree?: () => void;
};

export function Toolbar({
  repoPath,
  worktreeCount,
  mode,
  onModeChange,
  onNewWorktree,
}: ToolbarProps): React.JSX.Element {
  const sm = useSelectMode();
  return (
    <div className="border-border-subtle bg-background flex h-[var(--toolbar-h)] items-center justify-between border-b px-4">
      <div className="text-text-muted flex items-center gap-3 text-sm">
        <span className="text-sm">{repoPath}</span>
        <span className="text-text-secondary">· {worktreeCount} worktrees</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={cn(
            "text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150",
            sm.active && "bg-elevated text-text-primary"
          )}
          onClick={() => (sm.active ? sm.exit() : sm.enter())}
          title="Select worktrees"
        >
          <Icon icon={CheckSquare} />
        </button>
        <button
          className={cn(
            "text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150",
            mode === "overview" && "bg-elevated text-text-primary"
          )}
          onClick={() => onModeChange?.("overview")}
          title="Overview (⌘.)"
        >
          <Icon icon={LayoutGrid} />
        </button>
        <button
          className={cn(
            "text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150",
            mode === "focus" && "bg-elevated text-text-primary"
          )}
          onClick={() => onModeChange?.("focus")}
          title="Focus (⌘.)"
        >
          <Icon icon={Maximize2} />
        </button>
        <button
          className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
          onClick={onNewWorktree}
          title="New Worktree (⌘N)"
        >
          <Icon icon={Plus} />
        </button>
      </div>
    </div>
  );
}
