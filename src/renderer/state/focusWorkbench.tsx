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
import type { WorktreeFileChange } from "@shared/ipc";
import { api } from "../ipc/api";
import { useMode } from "./mode";
import { useRepos } from "./repos";
import { useWorktrees } from "./worktrees";

type FocusSelection = {
  relativePath: string;
  view: "editor" | "diff";
};

type FocusWorkbenchState = {
  activeWorktreePath: string | null;
  changes: WorktreeFileChange[];
  loading: boolean;
  error: string | null;
  selected: FocusSelection | null;
  selectFile: (relativePath: string) => void;
  selectDiff: (relativePath: string) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<FocusWorkbenchState | null>(null);

function describeError(error: { kind: string }): string {
  switch (error.kind) {
    case "git-failed":
      return "Git command failed";
    case "outside-worktree":
      return "Path is outside the worktree";
    case "not-found":
      return "File was not found";
    case "not-a-file":
      return "Path is not a regular file";
    case "binary":
      return "Binary files are not editable here";
    case "read-failed":
      return "Could not read file";
    case "write-failed":
      return "Could not write file";
    default:
      return "Unknown worktree file error";
  }
}

export function FocusWorkbenchProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { mode } = useMode();
  const { activeRepoId } = useRepos();
  const { worktrees, activeId } = useWorktrees();
  const activeWorktreePath =
    activeRepoId != null && activeId && worktrees.some((worktree) => worktree.path === activeId)
      ? activeId
      : null;
  const [changes, setChanges] = useState<WorktreeFileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FocusSelection | null>(null);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;
    if (!activeWorktreePath) {
      setChanges([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const status = await api.worktree.status({ worktreePath: activeWorktreePath });
    if (refreshId !== refreshIdRef.current) return;

    if (!status.ok) {
      setError(describeError(status.error));
      setLoading(false);
      return;
    }

    setChanges(status.value.changes);
    setError(null);
    setLoading(false);
  }, [activeWorktreePath]);

  useEffect(() => {
    setSelected(null);
    if (!activeWorktreePath) {
      void refresh();
      return;
    }
    if (mode !== "focus") {
      refreshIdRef.current += 1;
      setLoading(false);
      return;
    }
    void refresh();
  }, [activeWorktreePath, mode, refresh]);

  const value = useMemo<FocusWorkbenchState>(
    () => ({
      activeWorktreePath,
      changes,
      loading,
      error,
      selected,
      selectFile: (relativePath) => setSelected({ relativePath, view: "editor" }),
      selectDiff: (relativePath) => setSelected({ relativePath, view: "diff" }),
      refresh,
    }),
    [activeWorktreePath, changes, loading, error, selected, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFocusWorkbench(): FocusWorkbenchState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useFocusWorkbench must be inside <FocusWorkbenchProvider>");
  return value;
}
