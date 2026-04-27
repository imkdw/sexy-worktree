import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { JobSnapshot } from "@shared/newWorktree";
import { api } from "../ipc/api";
import { useRepos } from "./repos";
import { useWorktrees } from "./worktrees";

type State = {
  jobs: JobSnapshot[];
};

const Ctx = createContext<State | null>(null);

export function NewWorktreeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { activeRepoId, repos } = useRepos();
  const { refresh: refreshWorktrees } = useWorktrees();
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const reposRef = useRef(repos);
  reposRef.current = repos;

  useEffect(() => {
    if (!activeRepoId) {
      setJobs([]);
      return;
    }
    void (async () => {
      const r = await api.newWorktree.list({ repoId: activeRepoId });
      if (r.ok) setJobs(r.value.jobs);
    })();
    const off = api.newWorktree.onEvent((e) => {
      if (e.job.repoId !== activeRepoId) return;
      setJobs((prev) => {
        const idx = prev.findIndex((p) => p.id === e.job.id);
        if (idx < 0) return [...prev, e.job];
        const next = [...prev];
        next[idx] = e.job;
        return next;
      });
      if (e.kind === "completed" && e.job.status === "done") {
        void refreshWorktrees();
        const activeRepo = reposRef.current.find((r) => r.id === activeRepoId);
        if (activeRepo) {
          window.dispatchEvent(
            new CustomEvent("app:worktree-created", {
              detail: { worktreePath: e.job.worktreePath, repoPath: activeRepo.path },
            })
          );
        }
      }
    });
    return () => {
      off();
    };
  }, [activeRepoId, refreshWorktrees]);

  const value = useMemo(() => ({ jobs }), [jobs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNewWorktreeJobs(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNewWorktreeJobs must be inside <NewWorktreeProvider>");
  return v;
}
