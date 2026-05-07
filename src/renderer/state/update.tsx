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
import type { UpdateDownloadProgress, UpdateState } from "@shared/update";
import { api } from "../ipc/api";
import { useToast } from "./toast";

type State = {
  state: UpdateState;
  check: () => Promise<void>;
  download: () => Promise<void>;
  openDownloaded: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);

function isAvailable(state: UpdateState): state is Extract<UpdateState, { phase: "available" }> {
  return state.phase === "available";
}

function isDownloading(
  state: UpdateState
): state is Extract<UpdateState, { phase: "downloading" }> {
  return state.phase === "downloading";
}

function isDownloaded(state: UpdateState): state is Extract<UpdateState, { phase: "downloaded" }> {
  return state.phase === "downloaded";
}

function progressDescription(progress: UpdateDownloadProgress): string {
  if (progress.percent != null) return `${Math.round(progress.percent)}%`;

  const mb = progress.downloadedBytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB downloaded`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function UpdateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { push, update, dismiss } = useToast();
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const notifiedTagRef = useRef<Set<string>>(new Set());
  const progressToastIdRef = useRef<string | null>(null);
  const openedFilePathRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const downloadRef = useRef<() => Promise<void>>(async () => {});

  const dismissProgressToast = useCallback((): void => {
    const id = progressToastIdRef.current;
    if (!id) return;

    dismiss(id);
    progressToastIdRef.current = null;
  }, [dismiss]);

  const applyState = useCallback(
    (next: UpdateState): void => {
      if (!mountedRef.current) return;

      setState(next);

      if (!isDownloading(next)) {
        dismissProgressToast();
      }

      if (isAvailable(next)) {
        const tagName = next.update.tagName;
        if (!notifiedTagRef.current.has(tagName)) {
          notifiedTagRef.current.add(tagName);
          push({
            kind: "warning",
            title: `Sexy Worktree ${tagName} available`,
            description: "Download the DMG to install it.",
            action: {
              label: "Download update",
              onClick: () => downloadRef.current(),
            },
          });
        }
        return;
      }

      if (isDownloading(next)) {
        const progressToast = {
          kind: "progress" as const,
          title: "Downloading update",
          description: progressDescription(next.progress),
        };

        if (progressToastIdRef.current) {
          update(progressToastIdRef.current, progressToast);
        } else {
          progressToastIdRef.current = push(progressToast);
        }
        return;
      }

      if (isDownloaded(next)) {
        if (!openedFilePathRef.current.has(next.filePath)) {
          openedFilePathRef.current.add(next.filePath);
          push({
            kind: "success",
            title: "Update DMG opened",
            description: "Finish installing from the opened DMG.",
            durationMs: 5000,
          });
        }
      }
    },
    [dismissProgressToast, push, update]
  );

  const check = useCallback(async (): Promise<void> => {
    try {
      const result = await api.update.check();
      if (result.ok) {
        applyState(result.value.state);
        return;
      }

      push({
        kind: "error",
        title: "Update check failed",
        description: result.error.message,
        durationMs: 5000,
      });
    } catch (error) {
      push({
        kind: "error",
        title: "Update check failed",
        description: errorMessage(error),
        durationMs: 5000,
      });
    }
  }, [applyState, push]);

  const download = useCallback(async (): Promise<void> => {
    try {
      const result = await api.update.download();
      if (result.ok) {
        applyState(result.value.state);
        return;
      }

      dismissProgressToast();
      push({
        kind: "error",
        title: "Update download failed",
        description: result.error.message,
        durationMs: 5000,
      });
    } catch (error) {
      dismissProgressToast();
      push({
        kind: "error",
        title: "Update download failed",
        description: errorMessage(error),
        durationMs: 5000,
      });
    }
  }, [applyState, dismissProgressToast, push]);

  const openDownloaded = useCallback(async (): Promise<void> => {
    try {
      const result = await api.update.openDownloaded();
      if (result.ok) {
        applyState(result.value.state);
        return;
      }

      push({
        kind: "error",
        title: "Failed to open update",
        description: result.error.message,
        durationMs: 5000,
      });
    } catch (error) {
      push({
        kind: "error",
        title: "Failed to open update",
        description: errorMessage(error),
        durationMs: 5000,
      });
    }
  }, [applyState, push]);

  useEffect(() => {
    downloadRef.current = download;
  }, [download]);

  useEffect(() => {
    mountedRef.current = true;
    let receivedEventBeforeHydration = false;
    let hydrated = false;

    const unsubscribe = api.update.onEvent((event) => {
      if (!hydrated) {
        receivedEventBeforeHydration = true;
      }
      applyState(event.state);
    });

    void api.update
      .getState()
      .then((result) => {
        if (result.ok && !receivedEventBeforeHydration) {
          applyState(result.value.state);
        }
      })
      .catch(() => {})
      .finally(() => {
        hydrated = true;
      });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [applyState]);

  const value = useMemo(
    () => ({
      state,
      check,
      download,
      openDownloaded,
    }),
    [check, download, openDownloaded, state]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUpdate(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUpdate must be inside <UpdateProvider>");
  return v;
}
