import { useCallback, useEffect, useState } from "react";
import { SplitSquareVertical, SplitSquareHorizontal, X, Check, Square } from "lucide-react";
import { Icon } from "../icons/Icon";
import { PaneTree } from "./PaneTree";
import { useSelectMode } from "../state/selectMode";
import { useTerminalSessions } from "../state/terminalSessions";
import { NoPane } from "../empty/NoPane";
import type { ShortcutAction } from "../shortcuts/shortcutMap";
import { paneFocusNeighbour } from "@shared/paneNav";
import { findLeafIds } from "@shared/paneOps";
import { cn } from "../lib/cn";
import { Tooltip } from "../ui";

type CardProps = {
  repoId: number;
  branch: string;
  cwd: string;
  active: boolean;
  isMain?: boolean;
  onActivate: () => void;
  allIds?: string[];
  lastSelectedId?: string | null;
};

/**
 * 단일 워크트리를 표현하는 카드 컴포넌트.
 *
 * 페인 트리·터미널 인스턴스는 TerminalSessionsProvider가 소유하며,
 * 카드는 focusedId·단축키·UI 책임만 갖는다. Card unmount 시에도 풀은 보존된다.
 */
export function Card({
  repoId,
  branch,
  cwd,
  active,
  isMain,
  onActivate,
  allIds,
  lastSelectedId,
}: CardProps): React.JSX.Element {
  const ops = useTerminalSessions(repoId, cwd);
  const sm = useSelectMode();
  const isSelected = sm.selected.has(cwd);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // 트리가 처음 로드되거나 focusedId가 사라지면 첫 leaf로 초기화
  useEffect(() => {
    if (!ops.tree) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    const ids = findLeafIds(ops.tree);
    if (focusedId && ids.includes(focusedId)) return;
    setFocusedId(ids[0] ?? null);
  }, [ops.tree, focusedId]);

  const handleSplit = useCallback(
    (orientation: "horizontal" | "vertical") => {
      if (!focusedId) return;
      const newId = ops.split(focusedId, orientation);
      if (newId) setFocusedId(newId);
    },
    [ops, focusedId]
  );

  const handleClose = useCallback(() => {
    if (!focusedId) return;
    ops.closePane(focusedId);
    // 새 focusedId는 위 useEffect가 처리
  }, [ops, focusedId]);

  const handleNewPane = useCallback(() => {
    const id = ops.newPane();
    setFocusedId(id);
  }, [ops]);

  // 단축키 액션 — 활성 카드만 반응
  useEffect(() => {
    if (!active) return;
    function handle(e: Event): void {
      const action = (e as CustomEvent<ShortcutAction>).detail;
      if (action === "split-v") handleSplit("vertical");
      if (action === "split-h") handleSplit("horizontal");
      if (action === "close-pane") handleClose();
      if (action.startsWith("pane-focus-") && ops.tree && focusedId) {
        const dir = action.replace("pane-focus-", "") as "left" | "right" | "up" | "down";
        const next = paneFocusNeighbour(ops.tree, focusedId, dir);
        if (next) setFocusedId(next);
      }
    }
    window.addEventListener("app:card-action", handle as EventListener);
    return () => window.removeEventListener("app:card-action", handle as EventListener);
  }, [active, handleSplit, handleClose, ops.tree, focusedId]);

  function handleClick(e: React.MouseEvent): void {
    if (sm.active && !isMain) {
      if (e.shiftKey && lastSelectedId && allIds) {
        sm.toggleRange(lastSelectedId, cwd, allIds);
      } else {
        sm.toggle(cwd);
      }
    } else {
      onActivate();
    }
  }

  const selectable = sm.active && !isMain;
  const selected = selectable && isSelected;
  const cardClass = cn(
    "group relative flex min-h-0 w-full flex-col overflow-hidden rounded-md border border-border-subtle bg-surface",
    selectable && "cursor-pointer",
    selected && "border-accent",
    active && !selected && "border-accent-soft"
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
    if (!selectable) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      sm.toggle(cwd);
    }
  }

  return (
    <section
      className={cardClass}
      onClick={handleClick}
      {...(selectable && {
        role: "checkbox",
        "aria-checked": isSelected,
        tabIndex: 0,
        onKeyDown: handleKeyDown,
      })}
    >
      {sm.active && !isMain && (
        <div className="text-accent pointer-events-none absolute top-2 right-2 z-10">
          <Icon icon={isSelected ? Check : Square} size={14} />
        </div>
      )}
      <header className="border-border-subtle flex h-9 items-center justify-between border-b px-3">
        <span className="text-text-secondary overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap">
          {branch}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Tooltip label="Split Vertical (⌘D)">
            <button
              className="text-text-muted hover:text-accent inline-flex h-6 w-6 items-center justify-center rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                handleSplit("vertical");
              }}
            >
              <Icon icon={SplitSquareVertical} size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Split Horizontal (⌘⇧D)">
            <button
              className="text-text-muted hover:text-accent inline-flex h-6 w-6 items-center justify-center rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                handleSplit("horizontal");
              }}
            >
              <Icon icon={SplitSquareHorizontal} size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Close pane (⌘W)">
            <button
              className="text-text-muted hover:text-accent inline-flex h-6 w-6 items-center justify-center rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
            >
              <Icon icon={X} size={14} />
            </button>
          </Tooltip>
        </div>
      </header>
      <div className="bg-background flex min-h-0 flex-1">
        {ops.tree ? (
          <PaneTree
            tree={ops.tree}
            focusedId={focusedId}
            getEntry={ops.getEntry}
            getExit={ops.getExit}
            onFocusLeaf={setFocusedId}
            onResize={ops.resize}
            onRestart={ops.restart}
          />
        ) : (
          <NoPane onNewPane={handleNewPane} />
        )}
      </div>
    </section>
  );
}
