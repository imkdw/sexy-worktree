import { useRef } from "react";
import { Check, CheckSquare, ChevronLeft, ChevronRight, Square, X } from "lucide-react";
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
  const selectedCount = selectableIds.filter((id) => sm.selected.has(id)).length;
  const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
  const hasSelectableWorktrees = selectableIds.length > 0;
  const selectAllLabel = !hasSelectableWorktrees
    ? "No selectable worktrees"
    : allSelected
      ? "Clear selection"
      : "Select all worktrees";
  const selectAllAriaLabel = !hasSelectableWorktrees
    ? "No selectable worktrees"
    : allSelected
      ? "Clear selected worktrees"
      : "Select all worktrees";
  const collapseLabel = sm.enabled ? "Cancel selection mode before collapsing rail" : collapsed ? "Expand" : "Collapse";
  const collapseAriaLabel = sm.enabled
    ? "Rail collapse disabled in selection mode"
    : collapsed
      ? "Expand rail"
      : "Collapse rail";

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

  function enterSelectionMode(): void {
    if (collapsed) toggleCollapsed();
    sm.enter();
  }

  function toggleAllSelectable(): void {
    sm.toggleAll(selectableIds);
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
      <div className="border-border-subtle border-b p-2">
        {sm.enabled ? (
          <div className="flex items-center gap-2">
            <Tooltip label={selectAllLabel}>
              <span className="inline-flex h-8 w-8 shrink-0">
                <button
                  aria-label={selectAllAriaLabel}
                  className="text-text-muted hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150"
                  disabled={!hasSelectableWorktrees}
                  onClick={toggleAllSelectable}
                >
                  <Icon icon={allSelected ? CheckSquare : Square} size={14} />
                </button>
              </span>
            </Tooltip>
            {!collapsed && (
              <span className="text-text-secondary min-w-0 flex-1 truncate text-xs">
                {selectedCount} selected
              </span>
            )}
            <Tooltip label="Cancel selection">
              <button
                aria-label="Cancel selection mode"
                className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150"
                onClick={() => sm.exit()}
              >
                <Icon icon={X} size={14} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <Tooltip label="Select worktrees">
            <button
              aria-label="Enter worktree selection mode"
              className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-full items-center justify-center gap-2 rounded-sm transition-colors duration-150"
              onClick={enterSelectionMode}
            >
              <Icon icon={Square} size={14} />
              {!collapsed && <span className="text-xs">Select</span>}
            </button>
          </Tooltip>
        )}
      </div>
      <div className="scrollbar-hidden flex-1 overflow-y-auto py-2">
        {worktrees.map((wt) => {
          const id = worktreeId(wt);
          const active = id === activeId;
          const isSelected = sm.selected.has(id);
          const showCheckbox = sm.enabled && !collapsed && !wt.isMain;
          const showSelectionPlaceholder = sm.enabled && !collapsed && wt.isMain;
          return (
            <div
              key={id}
              className={cn(
                "text-text-secondary hover:bg-surface flex h-8 items-center gap-3 overflow-hidden px-3 text-sm text-ellipsis whitespace-nowrap transition-colors duration-150",
                sm.enabled && wt.isMain ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                active && "text-text-primary"
              )}
              onClick={(e) => {
                if (!sm.enabled) {
                  setActive(id);
                  return;
                }
                if (wt.isMain) return;
                if (e.shiftKey) sm.toggleRangeTo(id, selectableIds);
                else sm.toggle(id);
              }}
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
                      "border-border-strong focus-visible:ring-accent-soft focus-visible:ring-offset-background inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                      isSelected && "border-accent bg-accent text-background"
                    )}
                  >
                    {isSelected && <Icon icon={Check} size={10} />}
                  </span>
                ) : showSelectionPlaceholder ? (
                  <span className="inline-block h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
                ) : null)}
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
        <Tooltip label={collapseLabel}>
          <span className="inline-flex h-8 w-8">
            <button
              aria-label={collapseAriaLabel}
              className="text-text-muted hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
              disabled={sm.enabled}
              onClick={() => toggleCollapsed()}
            >
              <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={14} />
            </button>
          </span>
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
