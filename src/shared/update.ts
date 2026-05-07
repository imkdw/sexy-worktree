export const UPDATE_REPOSITORY = {
  owner: "imkdw",
  repo: "sexy-worktree",
} as const;

export type UpdatePhase =
  | "idle"
  | "checking"
  | "not-available"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type UpdateErrorKind =
  | "disabled"
  | "request-failed"
  | "invalid-response"
  | "rate-limited"
  | "invalid-version"
  | "asset-missing"
  | "download-failed"
  | "open-failed"
  | "not-available"
  | "unknown";

export type UpdateError = {
  kind: UpdateErrorKind;
  message: string;
};

export type UpdateReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
  size: number | null;
  contentType: string | null;
};

export type UpdateInfo = {
  version: string;
  tagName: string;
  releaseName: string | null;
  htmlUrl: string;
  publishedAt: string | null;
  asset: UpdateReleaseAsset;
};

export type UpdateDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
};

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking"; currentVersion: string }
  | { phase: "not-available"; currentVersion: string; checkedAt: number }
  | { phase: "available"; currentVersion: string; checkedAt: number; update: UpdateInfo }
  | {
      phase: "downloading";
      currentVersion: string;
      update: UpdateInfo;
      progress: UpdateDownloadProgress;
    }
  | { phase: "downloaded"; currentVersion: string; update: UpdateInfo; filePath: string }
  | { phase: "error"; currentVersion: string; checkedAt: number; error: UpdateError };

export type UpdateEvent = {
  state: UpdateState;
};
