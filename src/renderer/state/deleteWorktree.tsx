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
import type { DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";
import { api } from "../ipc/api";
import { useRepos } from "./repos";
import { useWorktrees } from "./worktrees";

type State = {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
};

const AUTO_DISMISS_MS = 3000;

const Ctx = createContext<State | null>(null);

function findDeletedTransitions(
  previous: DeleteWorktreeJobSnapshot | undefined,
  next: DeleteWorktreeJobSnapshot
): boolean {
  const previousStatuses = new Map(
    previous?.items.map((item) => [item.worktreePath, item.status] as const) ?? []
  );

  return next.items.some(
    (item) => item.status === "deleted" && previousStatuses.get(item.worktreePath) !== "deleted"
  );
}

function mergeJob(
  jobs: DeleteWorktreeJobSnapshot[],
  job: DeleteWorktreeJobSnapshot
): DeleteWorktreeJobSnapshot[] {
  const index = jobs.findIndex((current) => current.id === job.id);
  if (index < 0) return [...jobs, job];

  const next = [...jobs];
  next[index] = job;
  return next;
}

export function DeleteWorktreeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const { refreshRepo } = useWorktrees();
  const [jobs, setJobs] = useState<DeleteWorktreeJobSnapshot[]>([]);
  const jobsRef = useRef<DeleteWorktreeJobSnapshot[]>([]);
  const mountedRef = useRef(true);
  const mutationVersionRef = useRef(0);
  const eventVersionByJobIdRef = useRef<Map<string, number>>(new Map());
  const dismissVersionByJobIdRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((jobId: string): void => {
    const timer = timersRef.current.get(jobId);
    if (!timer) return;
    clearTimeout(timer);
    timersRef.current.delete(jobId);
  }, []);

  const clearTimers = useCallback((): void => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  const replaceJobs = useCallback((next: DeleteWorktreeJobSnapshot[]): void => {
    jobsRef.current = next;
    if (mountedRef.current) {
      setJobs(next);
    }
  }, []);

  const removeJob = useCallback(
    (jobId: string): void => {
      mutationVersionRef.current += 1;
      dismissVersionByJobIdRef.current.set(jobId, mutationVersionRef.current);
      clearTimer(jobId);
      replaceJobs(jobsRef.current.filter((job) => job.id !== jobId));
    },
    [clearTimer, replaceJobs]
  );

  const dismiss = useCallback(
    async (jobId: string): Promise<void> => {
      const result = await api.worktreeDelete.dismiss({ jobId });
      if (result.ok) {
        removeJob(jobId);
      }
    },
    [removeJob]
  );

  const cancel = useCallback(async (jobId: string): Promise<void> => {
    await api.worktreeDelete.cancel({ jobId });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    mutationVersionRef.current += 1;
    const requestVersion = mutationVersionRef.current;
    eventVersionByJobIdRef.current.clear();
    dismissVersionByJobIdRef.current.clear();
    clearTimers();
    replaceJobs([]);

    if (activeRepoId == null) {
      return;
    }

    let active = true;
    void (async () => {
      const result = await api.worktreeDelete.list({ repoId: activeRepoId });
      if (active && result.ok) {
        const next = [...jobsRef.current];
        for (const listJob of result.value.jobs) {
          const dismissVersion = dismissVersionByJobIdRef.current.get(listJob.id) ?? 0;
          if (dismissVersion > requestVersion) continue;

          const eventVersion = eventVersionByJobIdRef.current.get(listJob.id) ?? 0;
          const existingIndex = next.findIndex((job) => job.id === listJob.id);
          if (eventVersion > requestVersion) {
            continue;
          }
          if (existingIndex >= 0) {
            next[existingIndex] = listJob;
          } else {
            next.push(listJob);
          }
        }
        replaceJobs(next);
      }
    })();

    const off = api.worktreeDelete.onEvent((event) => {
      if (event.kind === "dismissed") {
        removeJob(event.jobId);
        return;
      }

      if (event.job.repoId !== activeRepoId) return;

      mutationVersionRef.current += 1;
      eventVersionByJobIdRef.current.set(event.job.id, mutationVersionRef.current);
      const previous = jobsRef.current.find((current) => current.id === event.job.id);
      const next = mergeJob(jobsRef.current, event.job);
      replaceJobs(next);
      if (findDeletedTransitions(previous, event.job)) {
        void refreshRepo(event.job.repoId);
      }
    });

    return () => {
      active = false;
      off();
    };
  }, [activeRepoId, clearTimers, refreshRepo, removeJob, replaceJobs]);

  useEffect(() => {
    const doneIds = new Set(jobs.filter((job) => job.status === "done").map((job) => job.id));

    for (const [jobId, timer] of timersRef.current.entries()) {
      if (!doneIds.has(jobId)) {
        clearTimeout(timer);
        timersRef.current.delete(jobId);
      }
    }

    for (const job of jobs) {
      if (job.status !== "done" || timersRef.current.has(job.id)) continue;

      const timer = setTimeout(() => {
        timersRef.current.delete(job.id);
        void api.worktreeDelete.dismiss({ jobId: job.id }).then((result) => {
          if (result.ok) {
            if (mountedRef.current) {
              removeJob(job.id);
            }
          }
        });
      }, AUTO_DISMISS_MS);
      timersRef.current.set(job.id, timer);
    }
  }, [jobs, removeJob]);

  const value = useMemo(() => ({ jobs, cancel, dismiss }), [jobs, cancel, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeleteWorktreeJobs(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDeleteWorktreeJobs must be inside <DeleteWorktreeProvider>");
  return v;
}
