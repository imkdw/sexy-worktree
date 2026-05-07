import { app, shell } from "electron";
import { err, ok, type Result } from "@shared/result";
import {
  UPDATE_REPOSITORY,
  type UpdateDownloadProgress,
  type UpdateError,
  type UpdateEvent,
  type UpdateReleaseAsset,
  type UpdateState,
} from "@shared/update";
import { downloadReleaseAsset, type DownloadResult } from "./download";
import { fetchGitHubReleases, selectLatestUpdate, type GitHubRelease } from "./githubRelease";

export type UpdateManagerDeps = {
  getCurrentVersion: () => string;
  getDownloadsPath: () => string;
  fetchReleases: () => Promise<Result<GitHubRelease[], UpdateError>>;
  downloadAsset: (params: {
    downloadsDir: string;
    asset: UpdateReleaseAsset;
    onProgress: (progress: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">) => void;
  }) => Promise<DownloadResult>;
  openPath: (path: string) => Promise<string>;
  now: () => number;
};

type CheckOptions = { silent: boolean };

type UpdateResult = Result<{ state: UpdateState }, UpdateError>;
type DownloadedRecord = Pick<
  Extract<UpdateState, { phase: "downloaded" }>,
  "currentVersion" | "update" | "filePath"
>;

function toProgress({
  downloadedBytes,
  totalBytes,
}: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">): UpdateDownloadProgress {
  return {
    downloadedBytes,
    totalBytes,
    percent:
      totalBytes === null || totalBytes <= 0
        ? null
        : Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)),
  };
}

function errorFromUnknown(
  kind: UpdateError["kind"],
  fallback: string,
  error: unknown
): UpdateError {
  return {
    kind,
    message: error instanceof Error ? error.message : fallback,
  };
}

export class UpdateManager {
  private state: UpdateState = { phase: "idle" };

  private operationId = 0;

  private downloadedRecord: DownloadedRecord | null = null;

  private readonly listeners = new Set<(event: UpdateEvent) => void>();

  constructor(private readonly deps: UpdateManagerDeps) {}

  getState(): UpdateState {
    return this.state;
  }

  onEvent(listener: (event: UpdateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: UpdateState, emit = true): void {
    this.state = next;
    if (!emit) return;

    for (const listener of [...this.listeners]) {
      try {
        listener({ state: next });
      } catch {
        // Listener failures must not break update state transitions or other listeners.
      }
    }
  }

  async check(options: CheckOptions = { silent: false }): Promise<UpdateResult> {
    const operationId = ++this.operationId;
    const currentVersion = this.deps.getCurrentVersion();
    this.setState({ phase: "checking", currentVersion }, !options.silent);

    const releases = await this.deps.fetchReleases();
    if (this.isStale(operationId)) return ok({ state: this.state });

    if (!releases.ok) {
      const state: UpdateState = {
        phase: "error",
        currentVersion,
        checkedAt: this.deps.now(),
        error: releases.error,
      };
      this.setState(state, !options.silent);
      return err(releases.error);
    }

    const selected = selectLatestUpdate({
      releases: releases.value,
      currentVersion,
    });
    if (this.isStale(operationId)) return ok({ state: this.state });

    if (!selected.ok) {
      const state: UpdateState = {
        phase: "error",
        currentVersion,
        checkedAt: this.deps.now(),
        error: selected.error,
      };
      this.setState(state, !options.silent);
      return err(selected.error);
    }

    if (selected.value === null) {
      const state: UpdateState = {
        phase: "not-available",
        currentVersion,
        checkedAt: this.deps.now(),
      };
      this.setState(state, !options.silent);
      return ok({ state });
    }

    const state: UpdateState = {
      phase: "available",
      currentVersion,
      checkedAt: this.deps.now(),
      update: selected.value,
    };
    this.setState(state);
    return ok({ state });
  }

  async download(): Promise<UpdateResult> {
    if (this.state.phase === "downloaded") {
      return this.openDownloaded();
    }

    if (this.state.phase !== "available") {
      return err({
        kind: "not-available",
        message: "No update is available to download",
      });
    }

    const operationId = ++this.operationId;
    const availableState = this.state;
    this.setState({
      phase: "downloading",
      currentVersion: availableState.currentVersion,
      update: availableState.update,
      progress: toProgress({
        downloadedBytes: 0,
        totalBytes: availableState.update.asset.size,
      }),
    });

    let downloadResult: DownloadResult;
    try {
      downloadResult = await this.deps.downloadAsset({
        downloadsDir: this.deps.getDownloadsPath(),
        asset: availableState.update.asset,
        onProgress: (progress) => {
          if (this.isStale(operationId)) return;

          this.setState({
            phase: "downloading",
            currentVersion: availableState.currentVersion,
            update: availableState.update,
            progress: toProgress(progress),
          });
        },
      });
    } catch (error) {
      if (this.isStale(operationId)) return ok({ state: this.state });

      const updateError = errorFromUnknown("download-failed", "Update download failed", error);
      const state: UpdateState = {
        phase: "error",
        currentVersion: availableState.currentVersion,
        checkedAt: this.deps.now(),
        error: updateError,
      };
      this.setState(state);
      return err(updateError);
    }

    if (this.isStale(operationId)) return ok({ state: this.state });

    this.downloadedRecord = {
      currentVersion: availableState.currentVersion,
      update: availableState.update,
      filePath: downloadResult.filePath,
    };

    const openError = await this.deps.openPath(downloadResult.filePath);
    if (this.isStale(operationId)) return ok({ state: this.state });

    if (openError) {
      const updateError: UpdateError = {
        kind: "open-failed",
        message: openError,
      };
      const state: UpdateState = {
        phase: "error",
        currentVersion: availableState.currentVersion,
        checkedAt: this.deps.now(),
        error: updateError,
      };
      this.setState(state);
      return err(updateError);
    }

    const state: UpdateState = {
      phase: "downloaded",
      ...this.downloadedRecord,
    };
    this.setState(state);
    return ok({ state });
  }

  async openDownloaded(): Promise<UpdateResult> {
    const downloadedRecord = this.getOpenableDownloadedRecord();
    if (!downloadedRecord) {
      return err({
        kind: "not-available",
        message: "No downloaded update is available to open",
      });
    }

    const operationId = ++this.operationId;
    const openError = await this.deps.openPath(downloadedRecord.filePath);
    if (this.isStale(operationId)) return ok({ state: this.state });

    if (openError) {
      const updateError: UpdateError = {
        kind: "open-failed",
        message: openError,
      };
      const state: UpdateState = {
        phase: "error",
        currentVersion: downloadedRecord.currentVersion,
        checkedAt: this.deps.now(),
        error: updateError,
      };
      this.setState(state);
      return err(updateError);
    }

    this.downloadedRecord = downloadedRecord;
    const state: UpdateState = {
      phase: "downloaded",
      ...downloadedRecord,
    };
    this.setState(state);
    return ok({ state });
  }

  private isStale(operationId: number): boolean {
    return operationId !== this.operationId;
  }

  private getOpenableDownloadedRecord(): DownloadedRecord | null {
    if (this.state.phase === "downloaded") {
      return {
        currentVersion: this.state.currentVersion,
        update: this.state.update,
        filePath: this.state.filePath,
      };
    }

    if (
      this.state.phase === "error" &&
      this.state.error.kind === "open-failed" &&
      this.downloadedRecord
    ) {
      return this.downloadedRecord;
    }

    return null;
  }
}

export function createDefaultUpdateManager(): UpdateManager {
  return new UpdateManager({
    getCurrentVersion: () => app.getVersion(),
    getDownloadsPath: () => app.getPath("downloads"),
    fetchReleases: () => fetchGitHubReleases(UPDATE_REPOSITORY),
    downloadAsset: downloadReleaseAsset,
    openPath: (path) => shell.openPath(path),
    now: () => Date.now(),
  });
}

export const updateManager = createDefaultUpdateManager();
