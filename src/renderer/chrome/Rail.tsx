import { useEffect, useMemo, useRef, useState, type Key } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDiff,
  GitBranch,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import Tree, { type TreeNodeProps, type TreeProps } from "rc-tree";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useWorktrees, worktreeId } from "../state/worktrees";
import { useSelectMode } from "../state/selectMode";
import { useRepos } from "../state/repos";
import { useTerminalSessionCards } from "../state/terminalSessions";
import { useRailWidth } from "./useRailWidth";
import { Tooltip } from "../ui";
import { useMode } from "../state/mode";
import { useFocusWorkbench } from "../state/focusWorkbench";
import type { WorktreeFileChange, WorktreeFileStatus } from "@shared/ipc";

export function Rail(): React.JSX.Element {
  const { collapsed, isDragging, toggleCollapsed, startDrag } = useRailWidth();
  const asideRef = useRef<HTMLElement>(null);
  const { mode } = useMode();
  const sizing = { asideRef, collapsed, isDragging, toggleCollapsed, startDrag };

  return mode === "focus" ? <FocusRail {...sizing} /> : <WorktreeRail {...sizing} />;
}

function WorktreeRail({
  asideRef,
  collapsed,
  isDragging,
  toggleCollapsed,
  startDrag,
}: RailSizingProps): React.JSX.Element {
  const { worktrees, activeId, setActive } = useWorktrees();
  const { activeRepoId } = useRepos();
  const { openOrFocus } = useTerminalSessionCards();
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
  const collapseLabel = sm.enabled
    ? "Cancel selection mode before collapsing rail"
    : collapsed
      ? "Expand"
      : "Collapse";
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
        "border-border-subtle bg-background relative flex min-h-0 w-[var(--rail-w)] shrink-0 flex-col border-r",
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
                  className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
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
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto py-2">
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
                  if (activeRepoId) openOrFocus(activeRepoId, id);
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
                  <span
                    className="inline-block h-3.5 w-3.5 shrink-0 opacity-40"
                    aria-hidden="true"
                  />
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
              className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
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
        aria-label="Resize rail"
        aria-orientation="vertical"
        onMouseDown={(e) => {
          if (asideRef.current) startDrag(e, asideRef.current);
        }}
        className={cn(
          "group absolute top-0 right-0 h-full w-2 cursor-col-resize",
          !isDragging && "transition-colors duration-150"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "group-hover:bg-elevated pointer-events-none absolute top-0 right-0 h-full w-1 bg-transparent transition-colors duration-150",
            isDragging && "bg-accent"
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "bg-border-strong pointer-events-none absolute top-0 right-0 h-full w-px transition-colors duration-150",
            isDragging && "bg-accent"
          )}
        />
      </div>
    </aside>
  );
}

type RailSizingProps = {
  asideRef: React.RefObject<HTMLElement | null>;
  collapsed: boolean;
  isDragging: boolean;
  toggleCollapsed: () => void;
  startDrag: (e: React.MouseEvent, element: HTMLElement) => void;
};

const STATUS_LABEL: Record<WorktreeFileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  conflicted: "C",
};

function statusClass(status: WorktreeFileStatus): string {
  if (status === "added" || status === "untracked") return "text-success";
  if (status === "deleted" || status === "conflicted") return "text-destructive";
  if (status === "renamed") return "text-in-progress";
  return "text-accent";
}

const FOCUS_TREE_ROW_HEIGHT = 32;
const FOCUS_TREE_DEFAULT_HEIGHT = 640;
const CHANGES_SECTION_KEY = "section:changes";

type FocusTreeNodeKind = "section" | "change";

type FocusTreeNode = {
  key: string;
  title: string;
  label: string;
  kind: FocusTreeNodeKind;
  relativePath?: string;
  status?: WorktreeFileStatus;
  count?: number;
  children?: FocusTreeNode[];
  isLeaf?: boolean;
  selectable?: boolean;
};

type FocusTreeModel = {
  treeData: FocusTreeNode[];
  keySet: Set<string>;
  ancestorKeysByKey: Map<string, string[]>;
};

function FocusRail({
  asideRef,
  collapsed,
  isDragging,
  toggleCollapsed,
  startDrag,
}: RailSizingProps): React.JSX.Element {
  const { changes, loading, error, selected, selectDiff, refresh } = useFocusWorkbench();

  const collapseLabel = collapsed ? "Expand" : "Collapse";
  const hasChanges = changes.length > 0;

  return (
    <aside
      ref={asideRef}
      className={cn(
        "border-border-subtle bg-background relative flex min-h-0 w-[var(--rail-w)] shrink-0 flex-col border-r",
        !isDragging && "transition-[width] duration-200",
        collapsed && "w-[var(--rail-w-collapsed)]"
      )}
    >
      <div className="border-border-subtle border-b p-2">
        <div className="flex items-center gap-2">
          <span className="text-text-muted inline-flex h-8 w-8 shrink-0 items-center justify-center">
            <Icon icon={GitBranch} size={14} />
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-text-secondary truncate text-xs">Changed Code</div>
              <div className="text-text-muted truncate text-xs">
                {hasChanges ? `${changes.length} changed` : "clean"}
              </div>
            </div>
          )}
          <Tooltip label="Refresh changes">
            <button
              aria-label="Refresh focus changes"
              className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 disabled:cursor-wait disabled:opacity-60"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <Icon icon={RefreshCw} size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </Tooltip>
        </div>
      </div>
      <FocusFileTree
        collapsed={collapsed}
        changes={changes}
        error={error}
        selected={selected}
        selectDiff={selectDiff}
      />
      <div className="border-border-subtle flex justify-end border-t p-2">
        <Tooltip label={collapseLabel}>
          <button
            aria-label={collapsed ? "Expand rail" : "Collapse rail"}
            className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
            onClick={() => toggleCollapsed()}
          >
            <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={14} />
          </button>
        </Tooltip>
      </div>
      <RailResizeHandle asideRef={asideRef} isDragging={isDragging} startDrag={startDrag} />
    </aside>
  );
}

function FocusFileTree({
  collapsed,
  changes,
  error,
  selected,
  selectDiff,
}: {
  collapsed: boolean;
  changes: WorktreeFileChange[];
  error: string | null;
  selected: { relativePath: string; view: "diff" | "editor" | "markdown" } | null;
  selectDiff: (relativePath: string) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([CHANGES_SECTION_KEY]);
  const treeModel = useMemo(() => buildFocusTreeModel(changes), [changes]);
  const selectedKey = selected ? selectedTreeKey(selected) : null;
  const selectedKeys = selectedKey && treeModel.keySet.has(selectedKey) ? [selectedKey] : [];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewportHeight = (): void => {
      setViewportHeight(container.clientHeight);
    };

    updateViewportHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setExpandedKeys((previous) => {
      const next = new Set<Key>();
      for (const key of previous) {
        if (treeModel.keySet.has(String(key))) next.add(key);
      }
      for (const node of treeModel.treeData) {
        next.add(node.key);
      }
      if (selectedKey) {
        for (const key of treeModel.ancestorKeysByKey.get(selectedKey) ?? []) {
          next.add(key);
        }
      }
      const nextKeys = [...next];
      return sameKeySet(previous, nextKeys) ? previous : nextKeys;
    });
  }, [selectedKey, treeModel]);

  const handleSelect: TreeProps<FocusTreeNode>["onSelect"] = (_keys, info): void => {
    const node = info.node;
    if (node.kind === "change" && node.relativePath) {
      selectDiff(node.relativePath);
    }
  };

  return (
    <div
      ref={containerRef}
      className="scrollbar-hidden min-h-0 flex-1 overflow-hidden py-2"
      data-focus-tree-collapsed={collapsed ? "true" : undefined}
      aria-label="Focus file explorer"
    >
      {error && !collapsed && (
        <div className="text-destructive flex h-8 items-center truncate px-3 text-xs">{error}</div>
      )}
      {treeModel.treeData.length > 0 ? (
        <Tree<FocusTreeNode>
          prefixCls="focus-file-tree"
          treeData={treeModel.treeData}
          expandedKeys={expandedKeys}
          selectedKeys={selectedKeys}
          selectable
          expandAction="click"
          showIcon={false}
          height={viewportHeight || FOCUS_TREE_DEFAULT_HEIGHT}
          itemHeight={FOCUS_TREE_ROW_HEIGHT}
          virtual
          titleRender={(node) => (
            <FocusTreeTitle
              collapsed={collapsed}
              node={node}
            />
          )}
          switcherIcon={renderFocusTreeSwitcherIcon}
          onExpand={(keys) => setExpandedKeys(keys)}
          onSelect={handleSelect}
        />
      ) : !error && !collapsed ? (
        <div className="text-text-muted flex h-8 items-center truncate px-3 text-xs">
          No changed files
        </div>
      ) : null}
    </div>
  );
}

function FocusTreeTitle({
  collapsed,
  node,
}: {
  collapsed: boolean;
  node: FocusTreeNode;
}): React.JSX.Element {
  return (
    <span
      data-focus-tree-key={node.key}
      data-focus-tree-row
      data-focus-tree-section={node.kind === "section" ? "true" : undefined}
    >
      <Icon icon={FileDiff} size={14} className="shrink-0" />
      {!collapsed && (
        <>
          <span data-focus-tree-label>{node.label}</span>
          {node.count != null && <span data-focus-tree-count>{node.count}</span>}
          {node.status && (
            <span data-focus-tree-status className={statusClass(node.status)}>
              {STATUS_LABEL[node.status]}
            </span>
          )}
        </>
      )}
    </span>
  );
}

function renderFocusTreeSwitcherIcon(props: TreeNodeProps): React.ReactNode {
  if (props.isLeaf) {
    return <span aria-hidden="true" />;
  }
  return <Icon icon={props.expanded ? ChevronDown : ChevronRight} size={14} />;
}

function selectedTreeKey(selected: {
  relativePath: string;
  view: "diff" | "editor" | "markdown";
}): string {
  return changeFileKey(selected.relativePath);
}

function buildFocusTreeModel(changes: WorktreeFileChange[]): FocusTreeModel {
  const treeData: FocusTreeNode[] = [];

  if (changes.length > 0) {
    treeData.push({
      key: CHANGES_SECTION_KEY,
      title: "Changes",
      label: "Changes",
      kind: "section",
      count: changes.length,
      children: buildChangeTree(changes),
      selectable: false,
      isLeaf: false,
    });
  }

  const keySet = new Set<string>();
  const ancestorKeysByKey = new Map<string, string[]>();
  indexTree(treeData, [], keySet, ancestorKeysByKey);

  return { treeData, keySet, ancestorKeysByKey };
}

function buildChangeTree(changes: WorktreeFileChange[]): FocusTreeNode[] {
  const rootChildren: FocusTreeNode[] = [];
  const files = new Set<string>();

  for (const change of changes) {
    const relativePath = change.relativePath.replace(/\/+$/, "");
    if (!relativePath) continue;

    if (files.has(relativePath)) continue;
    files.add(relativePath);

    rootChildren.push({
      key: changeFileKey(relativePath),
      title: relativePath,
      label: basenameOf(relativePath),
      kind: "change",
      relativePath,
      status: change.status,
      isLeaf: true,
    });
  }

  sortTreeChildren(rootChildren);
  return rootChildren;
}

function sortTreeChildren(nodes: FocusTreeNode[]): void {
  nodes.sort((a, b) => {
    const aBranch = isBranchNode(a);
    const bBranch = isBranchNode(b);
    if (aBranch !== bBranch) return aBranch ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  for (const node of nodes) {
    if (node.children) sortTreeChildren(node.children);
  }
}

function indexTree(
  nodes: FocusTreeNode[],
  ancestors: string[],
  keySet: Set<string>,
  ancestorKeysByKey: Map<string, string[]>
): void {
  for (const node of nodes) {
    keySet.add(node.key);
    ancestorKeysByKey.set(node.key, ancestors);
    if (node.children) {
      indexTree(node.children, [...ancestors, node.key], keySet, ancestorKeysByKey);
    }
  }
}

function isBranchNode(node: FocusTreeNode): boolean {
  return node.kind === "section";
}

function sameKeySet(left: Key[], right: Key[]): boolean {
  if (left.length !== right.length) return false;
  const leftKeys = new Set(left.map((key) => String(key)));
  return right.every((key) => leftKeys.has(String(key)));
}

function changeFileKey(relativePath: string): string {
  return `change:${relativePath}`;
}

function basenameOf(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index >= 0 ? relativePath.slice(index + 1) : relativePath;
}

function RailResizeHandle({
  asideRef,
  isDragging,
  startDrag,
}: Pick<RailSizingProps, "asideRef" | "isDragging" | "startDrag">): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-label="Resize rail"
      aria-orientation="vertical"
      onMouseDown={(e) => {
        if (asideRef.current) startDrag(e, asideRef.current);
      }}
      className={cn(
        "group absolute top-0 right-0 h-full w-2 cursor-col-resize",
        !isDragging && "transition-colors duration-150"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "group-hover:bg-elevated pointer-events-none absolute top-0 right-0 h-full w-1 bg-transparent transition-colors duration-150",
          isDragging && "bg-accent"
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "bg-border-strong pointer-events-none absolute top-0 right-0 h-full w-px transition-colors duration-150",
          isDragging && "bg-accent"
        )}
      />
    </div>
  );
}
