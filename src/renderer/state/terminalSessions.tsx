import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PaneNode } from "@shared/pane";
import { newLeaf } from "@shared/pane";
import { closeLeaf, findLeafIds, splitLeaf, updateLeaf } from "@shared/paneOps";
import {
  createLeafEntry,
  disposeLeafEntry,
  disposePtyForEntry,
  spawnPtyForEntry,
  type LeafEntry,
} from "../terminal/Terminal";
import type { LeafExit } from "../card/PaneTree";
import { api } from "../ipc/api";
import { useRepos } from "./repos";
import { useWorktrees } from "./worktrees";

type WorktreeKey = `${number}:${string}`;
type LeafKey = `${number}:${string}:${string}`;

const wkey = (repoId: number, wtPath: string): WorktreeKey => `${repoId}:${wtPath}`;
const lkey = (repoId: number, wtPath: string, leafId: string): LeafKey =>
  `${repoId}:${wtPath}:${leafId}`;

let counter = 0;
const newLeafId = (): string => `p${Date.now()}-${counter++}`;

function firstLeafId(n: PaneNode): string {
  return n.kind === "leaf" ? n.id : firstLeafId(n.a);
}

export type WorktreeOps = {
  tree: PaneNode | null;
  getEntry: (leafId: string) => LeafEntry | null;
  getExit: (leafId: string) => LeafExit | null;
  split: (focusedId: string, orientation: "horizontal" | "vertical") => string | null;
  closePane: (leafId: string) => void;
  resize: (path: number[], sizes: [number, number]) => void;
  newPane: () => string;
  updateLeafCommand: (leafId: string, cmd: string) => void;
  restart: (leafId: string) => void;
  getFirstPtyId: () => string | null;
};

type SessionsCtxValue = {
  getOps: (repoId: number, worktreePath: string) => WorktreeOps;
};

const SessionsCtx = createContext<SessionsCtxValue | null>(null);

export function TerminalSessionsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { repos } = useRepos();
  const { worktreesByRepo } = useWorktrees();

  // 라이브 상태 ref (async race 가드용 — 항상 최신값을 담음)
  const worktreesByRepoRef = useRef(worktreesByRepo);
  worktreesByRepoRef.current = worktreesByRepo;

  // 풀 — 모두 ref 기반 (변경 알림은 version bump으로)
  const paneTreesRef = useRef<Map<WorktreeKey, PaneNode | null>>(new Map());
  const entriesRef = useRef<Map<LeafKey, LeafEntry>>(new Map());
  const exitInfoRef = useRef<Map<LeafKey, LeafExit>>(new Map());
  const firstLeafIdsRef = useRef<Map<WorktreeKey, string>>(new Map());
  const saveTimersRef = useRef<Map<WorktreeKey, ReturnType<typeof setTimeout>>>(new Map());
  const loadingTreesRef = useRef<Set<WorktreeKey>>(new Set());

  const isWorktreeAlive = (repoId: number, worktreePath: string): boolean => {
    const list = worktreesByRepoRef.current.get(repoId);
    return !!list?.some((w) => w.path === worktreePath);
  };

  const [, bump] = useState(0);
  const triggerRender = useCallback(() => bump((v) => v + 1), []);

  // ── 핵심 헬퍼 ─────────────────────────────────────────

  const ensureLeafSpawned = useCallback(
    (repoId: number, worktreePath: string, leafId: string): void => {
      const key = lkey(repoId, worktreePath, leafId);
      if (entriesRef.current.has(key)) return; // idempotent guard
      const entry = createLeafEntry();
      entry.onCommandRun = (cmd) => updateLeafCommandInternal(repoId, worktreePath, leafId, cmd);
      entry.onExit = (code, lastBytes) => {
        exitInfoRef.current.set(key, { kind: "exited", code, lastBytes });
        triggerRender();
      };
      entry.onSpawnError = (e) => {
        exitInfoRef.current.set(key, { kind: "spawn-failed", error: e });
        triggerRender();
      };
      entriesRef.current.set(key, entry);
      void spawnPtyForEntry(entry, worktreePath);
      triggerRender();
    },
    // updateLeafCommandInternal이 아래에 정의됨 (closure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [triggerRender]
  );

  const disposeLeaf = useCallback(
    (repoId: number, worktreePath: string, leafId: string): void => {
      const key = lkey(repoId, worktreePath, leafId);
      const entry = entriesRef.current.get(key);
      if (entry) disposeLeafEntry(entry);
      entriesRef.current.delete(key);
      exitInfoRef.current.delete(key);
      triggerRender();
    },
    [triggerRender]
  );

  const disposeWorktree = useCallback(
    (repoId: number, worktreePath: string): void => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (tree) {
        for (const leafId of findLeafIds(tree)) {
          const lk = lkey(repoId, worktreePath, leafId);
          const entry = entriesRef.current.get(lk);
          if (entry) disposeLeafEntry(entry);
          entriesRef.current.delete(lk);
          exitInfoRef.current.delete(lk);
        }
      }
      paneTreesRef.current.delete(wk);
      firstLeafIdsRef.current.delete(wk);
      const t = saveTimersRef.current.get(wk);
      if (t) clearTimeout(t);
      saveTimersRef.current.delete(wk);
      triggerRender();
    },
    [triggerRender]
  );

  const disposeRepo = useCallback(
    (repoId: number): void => {
      // 동일 repoId의 모든 worktree 키 정리
      for (const key of [...paneTreesRef.current.keys()]) {
        if (key.startsWith(`${repoId}:`)) {
          const wtPath = key.slice(`${repoId}:`.length);
          disposeWorktree(repoId, wtPath);
        }
      }
    },
    [disposeWorktree]
  );

  const setTreeAndDiff = useCallback(
    (repoId: number, worktreePath: string, nextTree: PaneNode | null): void => {
      const wk = wkey(repoId, worktreePath);
      const prev = paneTreesRef.current.get(wk) ?? null;
      paneTreesRef.current.set(wk, nextTree);

      const prevLeafIds = new Set(prev ? findLeafIds(prev) : []);
      const nextLeafIds = new Set(nextTree ? findLeafIds(nextTree) : []);

      // 새 leaf — spawn
      for (const id of nextLeafIds) {
        if (!prevLeafIds.has(id)) ensureLeafSpawned(repoId, worktreePath, id);
      }
      // 사라진 leaf — dispose
      for (const id of prevLeafIds) {
        if (!nextLeafIds.has(id)) disposeLeaf(repoId, worktreePath, id);
      }
      // firstLeafId 추적
      if (nextTree) {
        if (!firstLeafIdsRef.current.has(wk)) {
          firstLeafIdsRef.current.set(wk, firstLeafId(nextTree));
        }
      } else {
        firstLeafIdsRef.current.delete(wk);
      }
      triggerRender();
    },
    [ensureLeafSpawned, disposeLeaf, triggerRender]
  );

  // 디바운스 저장 (250ms, 워크트리별 타이머 분리)
  const scheduleSave = useCallback((repoId: number, worktreePath: string): void => {
    const wk = wkey(repoId, worktreePath);
    const existing = saveTimersRef.current.get(wk);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const tree = paneTreesRef.current.get(wk);
      if (tree) void api.pane.save({ repoId, worktreePath, tree });
      saveTimersRef.current.delete(wk);
    }, 250);
    saveTimersRef.current.set(wk, timer);
  }, []);

  // ── 메서드 (소비자 노출용 impl) ──────────────────────

  const updateLeafCommandInternal = useCallback(
    (repoId: number, worktreePath: string, leafId: string, cmd: string): void => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (!tree) return;
      const next = updateLeaf(tree, leafId, { lastCommand: cmd });
      paneTreesRef.current.set(wk, next);
      scheduleSave(repoId, worktreePath);
      triggerRender();
    },
    [scheduleSave, triggerRender]
  );

  const splitImpl = useCallback(
    (
      repoId: number,
      worktreePath: string,
      focusedId: string,
      orientation: "horizontal" | "vertical"
    ): string | null => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (!tree) return null;
      const id = newLeafId();
      const next = splitLeaf(tree, focusedId, orientation, id);
      setTreeAndDiff(repoId, worktreePath, next);
      scheduleSave(repoId, worktreePath);
      return id;
    },
    [setTreeAndDiff, scheduleSave]
  );

  const closePaneImpl = useCallback(
    (repoId: number, worktreePath: string, leafId: string): void => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (!tree) return;
      if (findLeafIds(tree).length <= 1) return;
      const next = closeLeaf(tree, leafId);
      if (!next) return;
      setTreeAndDiff(repoId, worktreePath, next);
      scheduleSave(repoId, worktreePath);
    },
    [setTreeAndDiff, scheduleSave]
  );

  const resizeImpl = useCallback(
    (repoId: number, worktreePath: string, path: number[], sizes: [number, number]): void => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (!tree) return;
      function walk(n: PaneNode, p: number[]): PaneNode {
        if (p.length === 0) {
          if (n.kind !== "split") return n;
          return { ...n, sizes };
        }
        if (n.kind !== "split") return n;
        const head = p[0]!;
        const rest = p.slice(1);
        return head === 0 ? { ...n, a: walk(n.a, rest) } : { ...n, b: walk(n.b, rest) };
      }
      paneTreesRef.current.set(wk, walk(tree, path));
      scheduleSave(repoId, worktreePath);
      triggerRender();
    },
    [scheduleSave, triggerRender]
  );

  const newPaneImpl = useCallback(
    (repoId: number, worktreePath: string): string => {
      const id = newLeafId();
      const leaf = newLeaf(id);
      setTreeAndDiff(repoId, worktreePath, leaf);
      scheduleSave(repoId, worktreePath);
      return id;
    },
    [setTreeAndDiff, scheduleSave]
  );

  const restartImpl = useCallback(
    (repoId: number, worktreePath: string, leafId: string): void => {
      const key = lkey(repoId, worktreePath, leafId);
      const entry = entriesRef.current.get(key);
      if (!entry) return;
      disposePtyForEntry(entry);
      exitInfoRef.current.delete(key);
      entry.term.write("\r\n[restarting]\r\n");
      void spawnPtyForEntry(entry, worktreePath);
      triggerRender();
    },
    [triggerRender]
  );

  // ── 라이프사이클 효과 ────────────────────────────────

  // 1) repos diff: 사라진 repoId의 자원 정리
  const prevRepoIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const currIds = new Set(repos.map((r) => r.id));
    for (const id of prevRepoIdsRef.current) {
      if (!currIds.has(id)) disposeRepo(id);
    }
    prevRepoIdsRef.current = currIds;
  }, [repos, disposeRepo]);

  // 2) worktreesByRepo diff: 사라진 worktree 정리, 신규 worktree pane tree 로드
  const prevWtKeysRef = useRef<Set<WorktreeKey>>(new Set());
  useEffect(() => {
    const currKeys = new Set<WorktreeKey>();
    for (const [repoId, list] of worktreesByRepo.entries()) {
      for (const wt of list) currKeys.add(wkey(repoId, wt.path));
    }
    // 사라진 worktree 정리
    for (const key of prevWtKeysRef.current) {
      if (!currKeys.has(key)) {
        const [repoIdStr, ...rest] = key.split(":");
        const repoId = Number(repoIdStr);
        const worktreePath = rest.join(":");
        disposeWorktree(repoId, worktreePath);
      }
    }
    // 신규 worktree pane tree 로드
    for (const key of currKeys) {
      if (prevWtKeysRef.current.has(key)) continue;
      if (paneTreesRef.current.has(key)) continue;
      if (loadingTreesRef.current.has(key)) continue;
      loadingTreesRef.current.add(key);
      const [repoIdStr, ...rest] = key.split(":");
      const repoId = Number(repoIdStr);
      const worktreePath = rest.join(":");
      void (async () => {
        const r = await api.pane.load({ repoId, worktreePath });
        loadingTreesRef.current.delete(key);
        // race 가드: 로드 중 worktree가 닫힌 경우 무시
        if (!isWorktreeAlive(repoId, worktreePath)) return;
        const initial = r.ok && r.value.tree ? r.value.tree : newLeaf(newLeafId());
        setTreeAndDiff(repoId, worktreePath, initial);
      })();
    }
    prevWtKeysRef.current = currKeys;
  }, [worktreesByRepo, disposeWorktree, setTreeAndDiff]);

  // 3) Provider unmount 시 pending save timers 정리 (HMR/테스트 안전)
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ── getOps (소비자 진입점) ────────────────────────────

  const getOps = useCallback(
    (repoId: number, worktreePath: string): WorktreeOps => {
      const wk = wkey(repoId, worktreePath);
      return {
        tree: paneTreesRef.current.get(wk) ?? null,
        getEntry: (leafId) => entriesRef.current.get(lkey(repoId, worktreePath, leafId)) ?? null,
        getExit: (leafId) => exitInfoRef.current.get(lkey(repoId, worktreePath, leafId)) ?? null,
        split: (focusedId, orientation) => splitImpl(repoId, worktreePath, focusedId, orientation),
        closePane: (leafId) => closePaneImpl(repoId, worktreePath, leafId),
        resize: (path, sizes) => resizeImpl(repoId, worktreePath, path, sizes),
        newPane: () => newPaneImpl(repoId, worktreePath),
        updateLeafCommand: (leafId, cmd) =>
          updateLeafCommandInternal(repoId, worktreePath, leafId, cmd),
        restart: (leafId) => restartImpl(repoId, worktreePath, leafId),
        getFirstPtyId: () => {
          const firstId = firstLeafIdsRef.current.get(wk);
          if (!firstId) return null;
          return entriesRef.current.get(lkey(repoId, worktreePath, firstId))?.ptyId ?? null;
        },
      };
    },
    [splitImpl, closePaneImpl, resizeImpl, newPaneImpl, updateLeafCommandInternal, restartImpl]
  );

  return <SessionsCtx.Provider value={{ getOps }}>{children}</SessionsCtx.Provider>;
}

export function useTerminalSessions(repoId: number, worktreePath: string): WorktreeOps {
  const v = useContext(SessionsCtx);
  if (!v) throw new Error("useTerminalSessions must be inside <TerminalSessionsProvider>");
  return v.getOps(repoId, worktreePath);
}
