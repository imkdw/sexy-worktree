import { LayoutGrid, Maximize2, Plus, CheckSquare } from "lucide-react";
import { Icon } from "../icons/Icon";
import { useSelectMode } from "../state/selectMode";
import { Tooltip, ToggleGroup, Toggle } from "../ui";

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
        <Tooltip label="Select worktrees">
          <Toggle
            pressed={sm.active}
            onPressedChange={(p) => (p ? sm.enter() : sm.exit())}
            aria-label="Select worktrees"
          >
            <Icon icon={CheckSquare} />
          </Toggle>
        </Tooltip>
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
      </div>
    </div>
  );
}
