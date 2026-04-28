import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SplitSquareVertical, SplitSquareHorizontal, X, Check, Square } from "lucide-react";
import { Icon } from "../icons/Icon";
import { PaneTree } from "./PaneTree";
import { usePaneTree } from "./usePaneTree";
import { useSelectMode } from "../state/selectMode";
import { NoPane } from "../empty/NoPane";
import type { ShortcutAction } from "../shortcuts/shortcutMap";
import { paneFocusNeighbour } from "@shared/paneNav";
import type { PaneNode } from "@shared/pane";
import { api } from "../ipc/api";
import { cn } from "../lib/cn";
import {
  createLeafEntry,
  disposeLeafEntry,
  disposePtyForEntry,
  spawnPtyForEntry,
  type LeafEntry,
} from "../terminal/Terminal";

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
 * 페인 트리, 단축키 액션 처리, 선택 모드 토글을 담당한다.
 * 워크트리 생성 직후 기본 시작 명령이 설정돼 있으면 첫 PTY에 자동 입력한다.
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
  const { tree, focusedId, setFocusedId, split, closeFocused, resize, newPane, updateLeafCommand } =
    usePaneTree(repoId, cwd);
  const sm = useSelectMode();
  const isSelected = sm.selected.has(cwd);
  const firstPtyIdRef = useRef<string | null>(null);

  const entriesRef = useRef<Map<string, LeafEntry>>(new Map());
  const [, bumpEntriesVersion] = useState(0);
  const [exitCodes, setExitCodes] = useState<Map<string, number>>(new Map());

  const leafIds = useMemo(() => collectLeafIds(tree), [tree]);

  useEffect(() => {
    const pool = entriesRef.current;
    const desired = new Set(leafIds);
    let changed = false;

    for (const id of leafIds) {
      if (pool.has(id)) continue;
      const entry = createLeafEntry();
      entry.onCommandRun = (cmd) => updateLeafCommand(id, cmd);
      entry.onExit = (code) =>
        setExitCodes((prev) => {
          const next = new Map(prev);
          next.set(id, code);
          return next;
        });
      pool.set(id, entry);
      changed = true;
      void spawnPtyForEntry(entry, cwd).then((ptyId) => {
        if (ptyId && !firstPtyIdRef.current) firstPtyIdRef.current = ptyId;
      });
    }

    for (const id of [...pool.keys()]) {
      if (desired.has(id)) continue;
      const entry = pool.get(id);
      if (entry) disposeLeafEntry(entry);
      pool.delete(id);
      changed = true;
      setExitCodes((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }

    if (changed) bumpEntriesVersion((v) => v + 1);
  }, [leafIds, cwd, updateLeafCommand]);

  useEffect(() => {
    const pool = entriesRef.current;
    return () => {
      for (const entry of pool.values()) disposeLeafEntry(entry);
      pool.clear();
    };
  }, []);

  const handleRestart = useCallback(
    (leafId: string) => {
      const entry = entriesRef.current.get(leafId);
      if (!entry) return;
      disposePtyForEntry(entry);
      setExitCodes((prev) => {
        if (!prev.has(leafId)) return prev;
        const next = new Map(prev);
        next.delete(leafId);
        return next;
      });
      entry.term.write("\r\n[restarting]\r\n");
      void spawnPtyForEntry(entry, cwd);
    },
    [cwd]
  );

  useEffect(() => {
    if (!active) return;
    function handle(e: Event): void {
      const action = (e as CustomEvent<ShortcutAction>).detail;
      if (action === "split-v") split("vertical");
      if (action === "split-h") split("horizontal");
      if (action === "close-pane") closeFocused();
      if (action.startsWith("pane-focus-") && tree && focusedId) {
        const dir = action.replace("pane-focus-", "") as "left" | "right" | "up" | "down";
        const next = paneFocusNeighbour(tree, focusedId, dir);
        if (next) setFocusedId(next);
      }
    }
    window.addEventListener("app:card-action", handle as EventListener);
    return () => window.removeEventListener("app:card-action", handle as EventListener);
  }, [active, split, closeFocused, tree, focusedId, setFocusedId]);

  useEffect(() => {
    const fn = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { worktreePath: string; repoPath: string };
      if (detail.worktreePath !== cwd) return;
      void (async () => {
        const c = await api.config.get({ repoPath: detail.repoPath });
        const cmd = c.ok ? c.value.config.worktree.defaultStartupCommand : "";
        if (!cmd) return;
        // 첫 PTY가 나타날 때까지 폴링으로 대기
        for (let i = 0; i < 20; i++) {
          const id = firstPtyIdRef.current;
          if (id) {
            await api.pty.write({ id, data: cmd + "\n" });
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      })();
    };
    window.addEventListener("app:worktree-created", fn);
    return () => window.removeEventListener("app:worktree-created", fn);
  }, [cwd]);

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

  return (
    <section className={cardClass} onClick={handleClick}>
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
          <button
            className="text-text-muted hover:text-accent inline-flex h-6 w-6 items-center justify-center rounded-sm"
            title="Split Vertical (⌘D)"
            onClick={(e) => {
              e.stopPropagation();
              split("vertical");
            }}
          >
            <Icon icon={SplitSquareVertical} size={14} />
          </button>
          <button
            className="text-text-muted hover:text-accent inline-flex h-6 w-6 items-center justify-center rounded-sm"
            title="Split Horizontal (⌘⇧D)"
            onClick={(e) => {
              e.stopPropagation();
              split("horizontal");
            }}
          >
            <Icon icon={SplitSquareHorizontal} size={14} />
          </button>
          <button
            className="text-text-muted hover:text-accent inline-flex h-6 w-6 items-center justify-center rounded-sm"
            title="Close pane (⌘W)"
            onClick={(e) => {
              e.stopPropagation();
              closeFocused();
            }}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
      </header>
      <div className="bg-background flex min-h-0 flex-1">
        {tree ? (
          <PaneTree
            tree={tree}
            focusedId={focusedId}
            entries={entriesRef.current}
            exitCodes={exitCodes}
            onFocusLeaf={setFocusedId}
            onResize={resize}
            onRestart={handleRestart}
          />
        ) : (
          <NoPane onNewPane={newPane} />
        )}
      </div>
    </section>
  );
}

function collectLeafIds(node: PaneNode | null): string[] {
  if (!node) return [];
  if (node.kind === "leaf") return [node.id];
  return [...collectLeafIds(node.a), ...collectLeafIds(node.b)];
}
