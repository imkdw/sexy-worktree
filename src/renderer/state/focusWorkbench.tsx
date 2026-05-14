import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { WorktreeFileChange } from "@shared/ipc";
import { api } from "../ipc/api";
import { isMarkdownFile } from "../focus/fileTypes";
import {
  OPEN_MARKDOWN_PATH_EVENT,
  type OpenMarkdownPathDetail,
} from "../terminal/markdownPathLinks";
import { useMode } from "./mode";
import { useRepos } from "./repos";
import { useWorktrees } from "./worktrees";

type FocusSelection = {
  relativePath: string;
  view: "diff" | "editor" | "markdown";
};

type FocusWorkbenchState = {
  activeWorktreePath: string | null;
  changes: WorktreeFileChange[];
  loading: boolean;
  error: string | null;
  selected: FocusSelection | null;
  terminalPanePercent: number;
  isResizingFocusPanes: boolean;
  selectFile: (relativePath: string) => void;
  selectDiff: (relativePath: string) => void;
  startFocusPaneResize: (event: MouseEvent, element: HTMLElement) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<FocusWorkbenchState | null>(null);
const FOCUS_SPLIT_STORAGE_KEY = "sexy-worktree:focus-terminal-pane-percent";
const FOCUS_SPLIT_MIN = 25;
const FOCUS_SPLIT_MAX = 75;
const FOCUS_SPLIT_DEFAULT = 50;

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function readStoredFocusSplit(): number {
  try {
    const raw = localStorage.getItem(FOCUS_SPLIT_STORAGE_KEY);
    if (raw === null) return FOCUS_SPLIT_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return FOCUS_SPLIT_DEFAULT;
    return clamp(parsed, FOCUS_SPLIT_MIN, FOCUS_SPLIT_MAX);
  } catch {
    return FOCUS_SPLIT_DEFAULT;
  }
}

function writeStoredFocusSplit(value: number): void {
  try {
    localStorage.setItem(FOCUS_SPLIT_STORAGE_KEY, String(value));
  } catch {
    // UI preference persistence should not block resizing.
  }
}

function viewForChangedFile(relativePath: string): FocusSelection["view"] {
  return isMarkdownFile(relativePath) ? "markdown" : "diff";
}

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
  const { mode, setMode } = useMode();
  const { activeRepoId } = useRepos();
  const { worktrees, activeId, setActive } = useWorktrees();
  const activeWorktreePath =
    activeRepoId != null && activeId && worktrees.some((worktree) => worktree.path === activeId)
      ? activeId
      : null;
  const [changes, setChanges] = useState<WorktreeFileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FocusSelection | null>(null);
  const [terminalPanePercent, setTerminalPanePercent] = useState(readStoredFocusSplit);
  const [isResizingFocusPanes, setIsResizingFocusPanes] = useState(false);
  const refreshIdRef = useRef(0);
  const terminalPanePercentRef = useRef(terminalPanePercent);
  const pendingTerminalMarkdownRef = useRef<OpenMarkdownPathDetail | null>(null);

  useEffect(() => {
    terminalPanePercentRef.current = terminalPanePercent;
  }, [terminalPanePercent]);

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
    const pending = pendingTerminalMarkdownRef.current;
    if (pending && pending.worktreePath === activeWorktreePath && mode === "focus") {
      pendingTerminalMarkdownRef.current = null;
      setSelected({ relativePath: pending.relativePath, view: "markdown" });
    } else {
      setSelected(null);
    }

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

  const openTerminalMarkdown = useCallback(
    (detail: OpenMarkdownPathDetail): void => {
      if (!worktrees.some((worktree) => worktree.path === detail.worktreePath)) return;

      pendingTerminalMarkdownRef.current = detail;
      setActive(detail.worktreePath);
      setMode("focus");

      if (activeWorktreePath === detail.worktreePath && mode === "focus") {
        pendingTerminalMarkdownRef.current = null;
        setSelected({ relativePath: detail.relativePath, view: "markdown" });
      }
    },
    [activeWorktreePath, mode, setActive, setMode, worktrees]
  );

  useEffect(() => {
    const onOpenMarkdownPath = (event: Event): void => {
      const detail = (event as CustomEvent<OpenMarkdownPathDetail>).detail;
      if (
        !detail ||
        typeof detail.worktreePath !== "string" ||
        typeof detail.relativePath !== "string"
      ) {
        return;
      }
      openTerminalMarkdown(detail);
    };

    window.addEventListener(OPEN_MARKDOWN_PATH_EVENT, onOpenMarkdownPath);
    return () => window.removeEventListener(OPEN_MARKDOWN_PATH_EVENT, onOpenMarkdownPath);
  }, [openTerminalMarkdown]);

  const startFocusPaneResize = useCallback((event: MouseEvent, element: HTMLElement): void => {
    event.preventDefault();

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizingFocusPanes(true);

    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return;

      const next = clamp(
        ((moveEvent.clientX - rect.left) / rect.width) * 100,
        FOCUS_SPLIT_MIN,
        FOCUS_SPLIT_MAX
      );
      terminalPanePercentRef.current = next;
      setTerminalPanePercent(next);
    };

    const onUp = (): void => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      setIsResizingFocusPanes(false);

      const final = Math.round(terminalPanePercentRef.current);
      setTerminalPanePercent(final);
      writeStoredFocusSplit(final);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }, []);

  const value = useMemo<FocusWorkbenchState>(
    () => ({
      activeWorktreePath,
      changes,
      loading,
      error,
      selected,
      terminalPanePercent,
      isResizingFocusPanes,
      selectFile: (relativePath) => setSelected({ relativePath, view: "editor" }),
      selectDiff: (relativePath) =>
        setSelected({ relativePath, view: viewForChangedFile(relativePath) }),
      startFocusPaneResize,
      refresh,
    }),
    [
      activeWorktreePath,
      changes,
      loading,
      error,
      selected,
      terminalPanePercent,
      isResizingFocusPanes,
      startFocusPaneResize,
      refresh,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFocusWorkbench(): FocusWorkbenchState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useFocusWorkbench must be inside <FocusWorkbenchProvider>");
  return value;
}
