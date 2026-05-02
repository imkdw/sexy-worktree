import { LayoutGrid, Maximize2, Plus, Settings as SettingsIcon, Trash2, X } from "lucide-react";
import { Icon } from "../icons/Icon";
import { useSelectMode } from "../state/selectMode";
import { useWorktrees } from "../state/worktrees";
import { Tooltip, ToggleGroup } from "../ui";
import { cn } from "../lib/cn";

type Mode = "overview" | "focus";

type ToolbarProps = {
  repoPath: string;
  worktreeCount: number;
  mode: Mode;
  onModeChange?: (m: Mode) => void;
  onNewWorktree?: () => void;
  onOpenSettings?: () => void;
  onForceDelete?: () => void;
};

export function Toolbar({
  repoPath,
  worktreeCount,
  mode,
  onModeChange,
  onNewWorktree,
  onOpenSettings,
  onForceDelete,
}: ToolbarProps): React.JSX.Element {
  const sm = useSelectMode();
  const { worktrees } = useWorktrees();
  const selectableCount = [...sm.selected].filter((id) => {
    const wt = worktrees.find((w) => w.path === id);
    return wt && !wt.isMain;
  }).length;
  return (
    <div className="border-border-subtle bg-background flex h-[var(--toolbar-h)] items-center justify-between border-b px-4">
      <div className="text-text-muted flex items-center gap-3 text-sm">
        <span className="text-sm">{repoPath}</span>
        <span className="text-text-secondary">· {worktreeCount} worktrees</span>
        {selectableCount > 0 && (
          <>
            <span className="text-text-secondary">·</span>
            <span className="text-text-secondary text-sm">{selectableCount} selected</span>
            <Tooltip label="Clear selection (Esc)">
              <button
                aria-label="Clear selection"
                className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-150"
                onClick={() => sm.clear()}
              >
                <Icon icon={X} size={14} />
              </button>
            </Tooltip>
            <Tooltip label="Force delete selected">
              <button
                aria-label="Force delete selected worktrees"
                className={cn(
                  "bg-destructive text-background inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium transition-opacity duration-150 hover:opacity-90"
                )}
                onClick={() => onForceDelete?.()}
              >
                <Icon icon={Trash2} size={14} />
                Force Delete
              </button>
            </Tooltip>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ToggleGroup.Root
          type="single"
          value={mode}
          onValueChange={(v) => v && onModeChange?.(v as Mode)}
        >
          <Tooltip label="Overview (⌘.)">
            <ToggleGroup.Item value="overview" aria-label="Overview">
              <Icon icon={LayoutGrid} />
            </ToggleGroup.Item>
          </Tooltip>
          <Tooltip label="Focus (⌘.)">
            <ToggleGroup.Item value="focus" aria-label="Focus">
              <Icon icon={Maximize2} />
            </ToggleGroup.Item>
          </Tooltip>
        </ToggleGroup.Root>
        <Tooltip label="New Worktree (⌘N)">
          <button
            className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
            onClick={onNewWorktree}
          >
            <Icon icon={Plus} />
          </button>
        </Tooltip>
        <Tooltip label={repoPath ? "Settings (⌘,)" : "Open a repo first"}>
          <button
            aria-label="Open settings"
            className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!repoPath}
            onClick={onOpenSettings}
          >
            <Icon icon={SettingsIcon} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
