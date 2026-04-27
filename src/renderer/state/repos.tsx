import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../ipc/api";
import type { RepoRow } from "@shared/ipc";
import { useToast } from "./toast";

function humanize(error: { kind: string }): string {
  switch (error.kind) {
    case "not-a-directory":
      return "Path is not a directory";
    case "not-a-git-repo":
      return "Path is not a git repository";
    case "is-a-worktree":
      return "Path is a worktree, not a main repo";
    default:
      return "Unknown validation error";
  }
}

type ReposState = {
  repos: RepoRow[];
  activeRepoId: number | null;
  refresh: () => Promise<void>;
  openRepo: () => Promise<void>;
  selectRepo: (id: number) => Promise<void>;
  closeRepo: (id: number) => Promise<void>;
};

const Ctx = createContext<ReposState | null>(null);

export function ReposProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<number | null>(null);
  const toast = useToast();

  const refresh = async (): Promise<void> => {
    const r = await api.repo.list();
    if (r.ok) {
      setRepos(r.value.repos);
      setActiveRepoId(r.value.activeRepoId);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openRepo = async (): Promise<void> => {
    const dialog = await api.repo.openDialog();
    if (!dialog.ok || dialog.value === null) return;
    const validation = await api.repo.validate({ path: dialog.value.path });
    if (!validation.ok) {
      toast.push({
        kind: "error",
        title: "Cannot open path",
        description: humanize(validation.error),
        durationMs: 5000,
      });
      return;
    }
    const added = await api.repo.add({
      path: validation.value.canonicalPath,
      name: validation.value.name,
    });
    if (!added.ok) {
      toast.push({
        kind: "error",
        title: "Failed to add repo",
        description: added.error.message,
        durationMs: 5000,
      });
      return;
    }
    await refresh();
  };

  const selectRepo = async (id: number): Promise<void> => {
    await api.repo.setActive({ id });
    await refresh();
  };

  const closeRepo = async (id: number): Promise<void> => {
    await api.repo.close({ id });
    await refresh();
  };

  return (
    <Ctx.Provider value={{ repos, activeRepoId, refresh, openRepo, selectRepo, closeRepo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRepos(): ReposState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRepos must be inside <ReposProvider>");
  return v;
}
