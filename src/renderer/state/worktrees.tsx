import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../ipc/api";
import type { Worktree } from "@shared/ipc";
import { useRepos } from "./repos";

type State = {
  worktreesByRepo: Map<number, Worktree[]>;
  worktrees: Worktree[]; // active repo only (backwards-compat)
  activeId: string | null;
  setActive: (id: string) => void;
  refresh: () => Promise<void>;
  refreshRepo: (repoId: number) => Promise<void>;
};

const Ctx = createContext<State | null>(null);

export function worktreeId(wt: Pick<Worktree, "path">): string {
  return wt.path;
}

export function WorktreesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { repos, activeRepoId } = useRepos();
  const [worktreesByRepo, setWorktreesByRepo] = useState<Map<number, Worktree[]>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const reposRef = useRef(repos);
  reposRef.current = repos;

  const refreshRepo = useCallback(async (repoId: number): Promise<void> => {
    const repo = reposRef.current.find((r) => r.id === repoId);
    if (!repo) return;
    const r = await api.worktree.list({ repoPath: repo.path });
    if (!r.ok) return; // keep cached on failure
    setWorktreesByRepo((prev) => {
      // Skip if repo was closed while IPC was in-flight.
      if (!reposRef.current.some((repo) => repo.id === repoId)) return prev;
      const next = new Map(prev);
      next.set(repoId, r.value.worktrees);
      return next;
    });
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all(reposRef.current.map((r) => refreshRepo(r.id)));
  }, [refreshRepo]);

  // Drop closed repos, load opened repos
  useEffect(() => {
    const openIds = new Set(repos.map((r) => r.id));
    setWorktreesByRepo((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of [...next.keys()]) {
        if (!openIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    void Promise.all(repos.map((r) => refreshRepo(r.id)));
  }, [repos, refreshRepo]);

  const worktrees = useMemo(
    () => (activeRepoId != null ? (worktreesByRepo.get(activeRepoId) ?? []) : []),
    [worktreesByRepo, activeRepoId]
  );

  // Initialize activeId once worktrees become available; reset to null when repo switches
  useEffect(() => {
    setActiveId((prev) => {
      if (prev && worktrees.find((w) => w.path === prev)) return prev;
      return worktrees[0]?.path ?? null;
    });
  }, [worktrees]);

  return (
    <Ctx.Provider
      value={{
        worktreesByRepo,
        worktrees,
        activeId,
        setActive: setActiveId,
        refresh,
        refreshRepo,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorktrees(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorktrees must be inside <WorktreesProvider>");
  return v;
}
