import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useWorktrees, worktreeId } from "../state/worktrees";

export function Rail(): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const { worktrees, activeId, setActive } = useWorktrees();
  return (
    <aside
      className={cn(
        "border-border-subtle bg-background flex w-[var(--rail-w)] shrink-0 flex-col border-r transition-[width] duration-200",
        collapsed && "w-[var(--rail-w-collapsed)]"
      )}
    >
      <div className="flex-1 overflow-y-auto py-2">
        {worktrees.map((wt) => {
          const id = worktreeId(wt);
          const active = id === activeId;
          return (
            <div
              key={id}
              className={cn(
                "text-text-secondary hover:bg-surface flex h-8 cursor-pointer items-center gap-3 overflow-hidden px-3 text-sm text-ellipsis whitespace-nowrap transition-colors duration-150",
                active && "text-text-primary"
              )}
              onClick={() => setActive(id)}
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  active ? "bg-accent" : "border-border-strong border"
                )}
              />
              {!collapsed && <span>{wt.branch ?? "(detached)"}</span>}
            </div>
          );
        })}
      </div>
      <div className="border-border-subtle flex justify-end border-t p-2">
        <button
          className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={14} />
        </button>
      </div>
    </aside>
  );
}
