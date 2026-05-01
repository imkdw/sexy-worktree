import { useRef } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useWorktrees, worktreeId } from "../state/worktrees";
import { useSelectMode } from "../state/selectMode";
import { useRailWidth } from "./useRailWidth";
import { Tooltip } from "../ui";

export function Rail(): React.JSX.Element {
  const { collapsed, isDragging, toggleCollapsed, startDrag } = useRailWidth();
  const asideRef = useRef<HTMLElement>(null);
  const { worktrees, activeId, setActive } = useWorktrees();
  const sm = useSelectMode();
  const selectableIds = worktrees.filter((w) => !w.isMain).map((w) => w.path);

  function handleCheckboxClick(e: React.MouseEvent, id: string): void {
    e.stopPropagation();
    if (e.shiftKey) sm.toggleRangeTo(id, selectableIds);
    else sm.toggle(id);
  }

  function handleCheckboxKey(e: React.KeyboardEvent, id: string): void {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) sm.toggleRangeTo(id, selectableIds);
      else sm.toggle(id);
    }
  }

  return (
    <aside
      ref={asideRef}
      className={cn(
        "border-border-subtle bg-background relative flex w-[var(--rail-w)] shrink-0 flex-col border-r",
        !isDragging && "transition-[width] duration-200",
        collapsed && "w-[var(--rail-w-collapsed)]"
      )}
    >
      <div className="scrollbar-hidden flex-1 overflow-y-auto py-2">
        {worktrees.map((wt) => {
          const id = worktreeId(wt);
          const active = id === activeId;
          const isSelected = sm.selected.has(id);
          const showCheckbox = !collapsed && !wt.isMain;
          return (
            <div
              key={id}
              className={cn(
                "text-text-secondary hover:bg-surface flex h-8 cursor-pointer items-center gap-3 overflow-hidden px-3 text-sm text-ellipsis whitespace-nowrap transition-colors duration-150",
                active && "text-text-primary"
              )}
              onClick={() => setActive(id)}
            >
              {!collapsed &&
                (showCheckbox ? (
                  <span
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Select ${wt.branch ?? wt.path}`}
                    tabIndex={0}
                    onClick={(e) => handleCheckboxClick(e, id)}
                    onKeyDown={(e) => handleCheckboxKey(e, id)}
                    className={cn(
                      "border-border-strong inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150",
                      isSelected && "border-accent bg-accent text-background"
                    )}
                  >
                    {isSelected && <Icon icon={Check} size={10} />}
                  </span>
                ) : (
                  // main 행: 정렬용 placeholder
                  <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ))}
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
        <Tooltip label={collapsed ? "Expand" : "Collapse"}>
          <button
            className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
            onClick={() => toggleCollapsed()}
          >
            <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={14} />
          </button>
        </Tooltip>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(e) => {
          if (asideRef.current) startDrag(e, asideRef.current);
        }}
        className={cn(
          "absolute top-0 right-0 h-full w-1 cursor-col-resize",
          "hover:bg-border-strong",
          isDragging && "bg-accent"
        )}
      />
    </aside>
  );
}
