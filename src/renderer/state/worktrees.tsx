import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../ipc/api";
import type { Worktree } from "@shared/ipc";
import { useRepos } from "./repos";

type State = {
  worktrees: Worktree[];
  activeId: string | null;
  setActive: (id: string) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);

export function worktreeId(wt: Pick<Worktree, "path">): string {
  return wt.path;
}

export function WorktreesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { repos, activeRepoId } = useRepos();
  const activePath = useMemo(
    () => repos.find((r) => r.id === activeRepoId)?.path ?? null,
    [repos, activeRepoId]
  );
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    if (!activePath) {
      setWorktrees([]);
      setActiveId(null);
      return;
    }
    const r = await api.worktree.list({ repoPath: activePath });
    if (r.ok) {
      setWorktrees(r.value.worktrees);
      setActiveId((prev) => prev ?? r.value.worktrees[0]?.path ?? null);
    } else {
      setWorktrees([]);
      setActiveId(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, [activePath]);

  return (
    <Ctx.Provider value={{ worktrees, activeId, setActive: setActiveId, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorktrees(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorktrees must be inside <WorktreesProvider>");
  return v;
}
