# GitHub Release Update Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free macOS update flow that checks public GitHub Releases, lets the user download the latest arm64 DMG to Downloads, and opens the DMG after download.

**Architecture:** Keep all network, filesystem, and shell operations in the Electron main process. Add a small update manager with typed IPC events, then let a renderer provider subscribe to update state and show an actionable toast. The update flow deliberately stops at DMG download/opening and does not replace the running app bundle.

**Tech Stack:** Electron main/preload IPC, Node `fetch`, Node `http`/`https` streaming, React 19 context, TypeScript strict mode, lucide-react toast UI, Vitest.

**Project Rule:** Do not create branches or commits unless the user explicitly asks. This plan intentionally has verification checkpoints instead of commit steps.

---

## File Structure

- Create `src/shared/update.ts`
  - Owns serializable update DTOs, phases, progress shape, repository constants, and typed update errors.
- Modify `src/shared/ipc.ts`
  - Adds `update:getState`, `update:check`, `update:download`, `update:openDownloaded`, and the exported update event alias.
- Modify `src/preload/index.ts`
  - Exposes typed update invokers and the `update:event` listener through `window.api.update`.
- Modify `src/renderer/ipc/api.ts`
  - Mirrors the preload update API for renderer typing.
- Create `src/main/update/version.ts`
  - Parses and compares app/release versions.
- Create `src/main/update/githubRelease.ts`
  - Fetches GitHub Releases, normalizes API data, filters stable releases, and selects the latest compatible DMG.
- Create `src/main/update/download.ts`
  - Resolves Downloads paths, writes to a temporary file, emits progress, validates size, renames on success, and reuses existing complete DMGs.
- Create `src/main/update/manager.ts`
  - Coordinates state transitions, release checks, downloads, DMG opening, listeners, and dependency injection for tests.
- Create `src/main/ipc/update.ts`
  - Registers update IPC handlers and forwards manager events to the renderer.
- Modify `src/main/ipc/index.ts`
  - Wires update IPC registration.
- Modify `src/main/index.ts`
  - Starts one silent update check after packaged app startup.
- Modify `src/renderer/state/toast.tsx`
  - Adds optional toast action metadata and an update helper for progress toasts.
- Modify `src/renderer/toast/Toast.tsx`
  - Renders an action button when a toast has an action.
- Create `src/renderer/state/update.tsx`
  - Subscribes to update events, stores update state, and pushes update/download/error toasts.
- Modify `src/renderer/App.tsx`
  - Adds `UpdateProvider` under `ToastProvider`.
- Modify renderer test API mocks in these files:
  - `test/renderer/chrome/Rail.test.tsx`
  - `test/renderer/newWorktree/NewWorktreeModal.test.ts`
  - `test/renderer/card/Card.test.tsx`
  - `test/renderer/state/overviewGridDensity.test.tsx`
  - `test/renderer/settings/Settings.test.tsx`
  - `test/renderer/selectMode/ConfirmDeleteModal.test.tsx`
  - `test/renderer/state/deleteWorktree.test.tsx`
- Add tests:
  - `test/main/update/version.test.ts`
  - `test/main/update/githubRelease.test.ts`
  - `test/main/update/download.test.ts`
  - `test/main/update/manager.test.ts`
  - `test/main/ipc/update.test.ts`
  - `test/renderer/toast/Toast.test.tsx`
  - `test/renderer/state/update.test.tsx`
- Modify `docs/release.md`
  - Documents the free in-app update checker and its manual install boundary.

---

### Task 1: Shared Update Contract And IPC Surface

**Files:**

- Create: `src/shared/update.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/ipc/api.ts`
- Modify test mocks listed in the file structure section.

- [ ] **Step 1: Add the shared update DTOs**

Create `src/shared/update.ts`:

```ts
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
```

- [ ] **Step 2: Add update channels to shared IPC types**

In `src/shared/ipc.ts`, add this import near the other shared imports:

```ts
import type { UpdateError, UpdateEvent, UpdateState } from "./update";
```

Add these channels inside `IpcChannels`, after `recents:list` or near other app-level channels:

```ts
  "update:getState": {
    in: void;
    out: Result<{ state: UpdateState }, never>;
  };
  "update:check": {
    in: void;
    out: Result<{ state: UpdateState }, UpdateError>;
  };
  "update:download": {
    in: void;
    out: Result<{ state: UpdateState }, UpdateError>;
  };
  "update:openDownloaded": {
    in: void;
    out: Result<{ state: UpdateState }, UpdateError>;
  };
```

Add this export next to `NewWorktreeJobEvent` and `WorktreeDeleteJobEvent`:

```ts
export type AppUpdateEvent = UpdateEvent;
```

- [ ] **Step 3: Expose update IPC in preload**

In `src/preload/index.ts`, add `AppUpdateEvent` to the type import from `@shared/ipc`:

```ts
  AppUpdateEvent,
```

Add this object to the exposed `api`:

```ts
  update: {
    getState: makeInvoker("update:getState"),
    check: makeInvoker("update:check"),
    download: makeInvoker("update:download"),
    openDownloaded: makeInvoker("update:openDownloaded"),
    onEvent: (cb: (e: AppUpdateEvent) => void) => {
      const fn = (_e: IpcRendererEvent, data: AppUpdateEvent): void => cb(data);
      ipcRenderer.on("update:event", fn);
      return () => ipcRenderer.off("update:event", fn);
    },
  },
```

- [ ] **Step 4: Mirror update IPC in renderer API types**

In `src/renderer/ipc/api.ts`, add `AppUpdateEvent` to the type import from `@shared/ipc`:

```ts
  AppUpdateEvent,
```

Add this property to the `Api` type:

```ts
  update: {
    getState: Invoker<"update:getState">;
    check: Invoker<"update:check">;
    download: Invoker<"update:download">;
    openDownloaded: Invoker<"update:openDownloaded">;
    onEvent: (cb: (e: AppUpdateEvent) => void) => () => void;
  };
```

- [ ] **Step 5: Update existing renderer API mocks**

In each renderer test mock listed in this task's files, add this property to the mock object returned as `typeof window.api` or `ApiMock`:

```ts
    update: {
      getState: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      openDownloaded: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
```

For `test/renderer/state/overviewGridDensity.test.tsx`, put the property between `overviewGridDensity` and `newWorktree`. For the other listed files, put it near `recents` or before `newWorktree`; the object order has no runtime effect.

- [ ] **Step 6: Run TypeScript to catch missing API mock updates**

Run:

```bash
pnpm typecheck
```

Expected: The update DTO and API shape compile, or TypeScript reports one of the known renderer mocks that still needs the `update` property from Step 5.

---

### Task 2: Version Parsing And GitHub Release Selection

**Files:**

- Create: `src/main/update/version.ts`
- Create: `src/main/update/githubRelease.ts`
- Create: `test/main/update/version.test.ts`
- Create: `test/main/update/githubRelease.test.ts`

- [ ] **Step 1: Write version helper tests**

Create `test/main/update/version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, isVersionGreater } from "@main/update/version";

describe("update version helpers", () => {
  it("parses plain and v-prefixed versions", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, version: "1.2.3" });
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, version: "1.2.3" });
  });

  it("rejects malformed versions", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("v1.2")).toBeNull();
    expect(parseVersion("v1.2.x")).toBeNull();
  });

  it("compares major, minor, then patch", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("reports whether a candidate is greater than the current app version", () => {
    expect(isVersionGreater("v1.0.1", "1.0.0")).toBe(true);
    expect(isVersionGreater("v1.0.0", "1.0.0")).toBe(false);
    expect(isVersionGreater("v0.9.9", "1.0.0")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the version tests and confirm they fail**

Run:

```bash
pnpm vitest run test/main/update/version.test.ts
```

Expected: FAIL because `@main/update/version` does not exist.

- [ ] **Step 3: Implement version helpers**

Create `src/main/update/version.ts`:

```ts
export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  version: string;
};

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

export function parseVersion(input: string): ParsedVersion | null {
  const match = VERSION_RE.exec(input.trim());
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }

  return { major, minor, patch, version: `${major}.${minor}.${patch}` };
}

export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA || !parsedB) {
    throw new Error(`Invalid version comparison: ${a} vs ${b}`);
  }

  if (parsedA.major !== parsedB.major) return parsedA.major - parsedB.major;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor - parsedB.minor;
  return parsedA.patch - parsedB.patch;
}

export function isVersionGreater(candidate: string, current: string): boolean {
  const parsedCandidate = parseVersion(candidate);
  const parsedCurrent = parseVersion(current);
  if (!parsedCandidate || !parsedCurrent) return false;
  return compareVersions(parsedCandidate.version, parsedCurrent.version) > 0;
}
```

- [ ] **Step 4: Write GitHub release selection tests**

Create `test/main/update/githubRelease.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@shared/result";
import {
  fetchGitHubReleases,
  selectLatestUpdate,
  type GitHubRelease,
} from "@main/update/githubRelease";

function release(overrides: Partial<GitHubRelease>): GitHubRelease {
  return {
    tagName: "v1.0.1",
    name: "Sexy Worktree v1.0.1",
    htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
    draft: false,
    prerelease: false,
    publishedAt: "2026-05-07T00:00:00Z",
    assets: [
      {
        name: "Sexy Worktree-1.0.1-arm64.dmg",
        browserDownloadUrl:
          "https://github.com/imkdw/sexy-worktree/releases/download/v1.0.1/app.dmg",
        size: 123,
        contentType: "application/x-apple-diskimage",
      },
    ],
    ...overrides,
  };
}

describe("selectLatestUpdate", () => {
  it("selects the highest stable release greater than the current version", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({ tagName: "v1.0.1" }),
        release({
          tagName: "v1.0.2",
          name: "Sexy Worktree v1.0.2",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.2",
          assets: [
            {
              name: "Sexy Worktree-1.0.2-arm64.dmg",
              browserDownloadUrl: "https://example.com/v1.0.2.dmg",
              size: 456,
              contentType: "application/x-apple-diskimage",
            },
          ],
        }),
      ],
    });

    expect(result).toEqual(
      ok({
        version: "1.0.2",
        tagName: "v1.0.2",
        releaseName: "Sexy Worktree v1.0.2",
        htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.2",
        publishedAt: "2026-05-07T00:00:00Z",
        asset: {
          name: "Sexy Worktree-1.0.2-arm64.dmg",
          browserDownloadUrl: "https://example.com/v1.0.2.dmg",
          size: 456,
          contentType: "application/x-apple-diskimage",
        },
      })
    );
  });

  it("ignores draft, prerelease, malformed, and non-newer releases", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({ tagName: "v2.0.0", draft: true }),
        release({ tagName: "v1.5.0", prerelease: true }),
        release({ tagName: "latest" }),
        release({ tagName: "v1.0.0" }),
      ],
    });

    expect(result).toEqual(ok(null));
  });

  it("returns a typed error when a newer release has no arm64 DMG", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({
          tagName: "v1.0.1",
          assets: [
            {
              name: "Sexy Worktree-1.0.1-x64.zip",
              browserDownloadUrl: "https://example.com/app.zip",
              size: 111,
              contentType: "application/zip",
            },
          ],
        }),
      ],
    });

    expect(result).toEqual(
      err({
        kind: "asset-missing",
        message: "No arm64 DMG asset found for v1.0.1",
      })
    );
  });
});

describe("fetchGitHubReleases", () => {
  it("normalizes GitHub release API data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v1.0.1",
          name: "Release",
          html_url: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
          draft: false,
          prerelease: false,
          published_at: "2026-05-07T00:00:00Z",
          assets: [
            {
              name: "Sexy Worktree-1.0.1-arm64.dmg",
              browser_download_url: "https://example.com/app.dmg",
              size: 123,
              content_type: "application/x-apple-diskimage",
            },
          ],
        },
      ],
    });

    await expect(
      fetchGitHubReleases({ owner: "imkdw", repo: "sexy-worktree", fetchImpl })
    ).resolves.toEqual(
      ok([
        {
          tagName: "v1.0.1",
          name: "Release",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
          draft: false,
          prerelease: false,
          publishedAt: "2026-05-07T00:00:00Z",
          assets: [
            {
              name: "Sexy Worktree-1.0.1-arm64.dmg",
              browserDownloadUrl: "https://example.com/app.dmg",
              size: 123,
              contentType: "application/x-apple-diskimage",
            },
          ],
        },
      ])
    );
  });

  it("returns rate-limited errors for HTTP 403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(
      fetchGitHubReleases({ owner: "imkdw", repo: "sexy-worktree", fetchImpl })
    ).resolves.toEqual(
      err({
        kind: "rate-limited",
        message: "GitHub release request was rate limited",
      })
    );
  });
});
```

- [ ] **Step 5: Run GitHub release tests and confirm they fail**

Run:

```bash
pnpm vitest run test/main/update/githubRelease.test.ts
```

Expected: FAIL because `@main/update/githubRelease` does not exist.

- [ ] **Step 6: Implement GitHub release fetching and selection**

Create `src/main/update/githubRelease.ts`:

```ts
import { err, ok, type Result } from "@shared/result";
import type { UpdateError, UpdateInfo, UpdateReleaseAsset } from "@shared/update";
import { compareVersions, isVersionGreater, parseVersion } from "./version";

export type GitHubReleaseAsset = UpdateReleaseAsset;

export type GitHubRelease = {
  tagName: string;
  name: string | null;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  assets: GitHubReleaseAsset[];
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<FetchResponseLike>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAsset(value: unknown): GitHubReleaseAsset | null {
  if (!isRecord(value)) return null;
  const name = stringOrNull(value.name);
  const browserDownloadUrl = stringOrNull(value.browser_download_url);
  if (!name || !browserDownloadUrl) return null;
  return {
    name,
    browserDownloadUrl,
    size: numberOrNull(value.size),
    contentType: stringOrNull(value.content_type),
  };
}

function normalizeRelease(value: unknown): GitHubRelease | null {
  if (!isRecord(value)) return null;
  const tagName = stringOrNull(value.tag_name);
  const htmlUrl = stringOrNull(value.html_url);
  if (!tagName || !htmlUrl) return null;

  const assets = Array.isArray(value.assets)
    ? value.assets
        .map(normalizeAsset)
        .filter((asset): asset is GitHubReleaseAsset => asset !== null)
    : [];

  return {
    tagName,
    name: stringOrNull(value.name),
    htmlUrl,
    draft: value.draft === true,
    prerelease: value.prerelease === true,
    publishedAt: stringOrNull(value.published_at),
    assets,
  };
}

export async function fetchGitHubReleases({
  owner,
  repo,
  fetchImpl = fetch,
}: {
  owner: string;
  repo: string;
  fetchImpl?: FetchLike;
}): Promise<Result<GitHubRelease[], UpdateError>> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Sexy-Worktree-Updater",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return err({
          kind: "rate-limited",
          message: "GitHub release request was rate limited",
        });
      }
      return err({
        kind: "request-failed",
        message: `GitHub release request failed with status ${response.status}`,
      });
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return err({ kind: "invalid-response", message: "GitHub release response was not an array" });
    }

    return ok(payload.map(normalizeRelease).filter((item): item is GitHubRelease => item !== null));
  } catch (error) {
    return err({
      kind: "request-failed",
      message: error instanceof Error ? error.message : "GitHub release request failed",
    });
  }
}

function selectArm64DmgAsset(release: GitHubRelease): GitHubReleaseAsset | null {
  return (
    release.assets.find((asset) => {
      const name = asset.name.toLowerCase();
      return name.endsWith(".dmg") && name.includes("arm64");
    }) ?? null
  );
}

export function selectLatestUpdate({
  releases,
  currentVersion,
}: {
  releases: GitHubRelease[];
  currentVersion: string;
}): Result<UpdateInfo | null, UpdateError> {
  if (!parseVersion(currentVersion)) {
    return err({
      kind: "invalid-version",
      message: `Current app version is invalid: ${currentVersion}`,
    });
  }

  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ release, parsed: parseVersion(release.tagName) }))
    .filter(
      (
        candidate
      ): candidate is {
        release: GitHubRelease;
        parsed: NonNullable<ReturnType<typeof parseVersion>>;
      } => candidate.parsed !== null && isVersionGreater(candidate.parsed.version, currentVersion)
    )
    .sort((a, b) => compareVersions(b.parsed.version, a.parsed.version));

  const selected = candidates[0];
  if (!selected) return ok(null);

  const asset = selectArm64DmgAsset(selected.release);
  if (!asset) {
    return err({
      kind: "asset-missing",
      message: `No arm64 DMG asset found for ${selected.release.tagName}`,
    });
  }

  return ok({
    version: selected.parsed.version,
    tagName: selected.release.tagName,
    releaseName: selected.release.name,
    htmlUrl: selected.release.htmlUrl,
    publishedAt: selected.release.publishedAt,
    asset,
  });
}
```

- [ ] **Step 7: Run version and release tests**

Run:

```bash
pnpm vitest run test/main/update/version.test.ts test/main/update/githubRelease.test.ts
```

Expected: PASS.

---

### Task 3: DMG Download Helper

**Files:**

- Create: `src/main/update/download.ts`
- Create: `test/main/update/download.test.ts`

- [ ] **Step 1: Write download helper tests**

Create `test/main/update/download.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  downloadReleaseAsset,
  resolveDownloadTarget,
  type FileDownloader,
} from "@main/update/download";
import type { UpdateReleaseAsset } from "@shared/update";

let dir: string;

const asset: UpdateReleaseAsset = {
  name: "Sexy Worktree-1.0.1-arm64.dmg",
  browserDownloadUrl: "https://example.com/app.dmg",
  size: 5,
  contentType: "application/x-apple-diskimage",
};

beforeEach(() => {
  dir = join(tmpdir(), `sexy-worktree-update-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveDownloadTarget", () => {
  it("uses the asset filename for final and temporary paths", () => {
    expect(resolveDownloadTarget({ downloadsDir: dir, asset })).toEqual({
      finalPath: join(dir, "Sexy Worktree-1.0.1-arm64.dmg"),
      tempPath: join(dir, "Sexy Worktree-1.0.1-arm64.dmg.download"),
    });
  });
});

describe("downloadReleaseAsset", () => {
  it("reuses an existing complete DMG", async () => {
    const finalPath = join(dir, asset.name);
    writeFileSync(finalPath, "12345");
    const downloader: FileDownloader = vi.fn();

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).resolves.toEqual({
      filePath: finalPath,
      reused: true,
    });
    expect(downloader).not.toHaveBeenCalled();
  });

  it("writes to a temporary file and renames it after success", async () => {
    const progress: Array<{ downloadedBytes: number; totalBytes: number | null }> = [];
    const downloader: FileDownloader = vi.fn(async ({ tempPath, onProgress }) => {
      writeFileSync(tempPath, "12345");
      onProgress({ downloadedBytes: 5, totalBytes: 5 });
    });

    const result = await downloadReleaseAsset({
      downloadsDir: dir,
      asset,
      downloader,
      onProgress: (event) => progress.push(event),
    });

    expect(result).toEqual({ filePath: join(dir, asset.name), reused: false });
    expect(readFileSync(result.filePath, "utf8")).toBe("12345");
    expect(existsSync(`${result.filePath}.download`)).toBe(false);
    expect(progress).toEqual([{ downloadedBytes: 5, totalBytes: 5 }]);
  });

  it("removes temporary files after failed downloads", async () => {
    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      writeFileSync(tempPath, "12");
      throw new Error("network down");
    });

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).rejects.toThrow(
      "network down"
    );
    expect(existsSync(join(dir, asset.name))).toBe(false);
    expect(existsSync(join(dir, `${asset.name}.download`))).toBe(false);
  });

  it("rejects downloads whose byte size does not match the release asset", async () => {
    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      writeFileSync(tempPath, "12");
    });

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).rejects.toThrow(
      "Downloaded file size did not match release asset size"
    );
    expect(existsSync(join(dir, asset.name))).toBe(false);
  });

  it("uses a non-empty file when GitHub does not provide an asset size", async () => {
    const finalPath = join(dir, asset.name);
    writeFileSync(finalPath, "1");

    await expect(
      downloadReleaseAsset({
        downloadsDir: dir,
        asset: { ...asset, size: null },
        downloader: vi.fn(),
      })
    ).resolves.toEqual({ filePath: finalPath, reused: true });
    expect(statSync(finalPath).size).toBe(1);
  });
});
```

- [ ] **Step 2: Run download tests and confirm they fail**

Run:

```bash
pnpm vitest run test/main/update/download.test.ts
```

Expected: FAIL because `@main/update/download` does not exist.

- [ ] **Step 3: Implement download helper**

Create `src/main/update/download.ts`:

```ts
import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import type { IncomingMessage } from "node:http";
import type { UpdateDownloadProgress, UpdateReleaseAsset } from "@shared/update";

export type FileDownloader = (params: {
  url: string;
  tempPath: string;
  onProgress: (progress: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">) => void;
}) => Promise<void>;

export type DownloadResult = {
  filePath: string;
  reused: boolean;
};

export function resolveDownloadTarget({
  downloadsDir,
  asset,
}: {
  downloadsDir: string;
  asset: UpdateReleaseAsset;
}): { finalPath: string; tempPath: string } {
  const finalPath = join(downloadsDir, asset.name);
  return { finalPath, tempPath: `${finalPath}.download` };
}

function isReusableFile(path: string, expectedSize: number | null): boolean {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (expectedSize !== null && expectedSize > 0) return size === expectedSize;
  return size > 0;
}

function request(url: string): typeof httpGet {
  return new URL(url).protocol === "http:" ? httpGet : httpsGet;
}

export async function downloadUrlToFile({
  url,
  tempPath,
  onProgress,
  redirectCount = 0,
}: {
  url: string;
  tempPath: string;
  onProgress: (progress: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">) => void;
  redirectCount?: number;
}): Promise<void> {
  if (redirectCount > 5) throw new Error("Too many download redirects");

  await new Promise<void>((resolve, reject) => {
    const req = request(url)(url, (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;

      if (status >= 300 && status < 400 && location) {
        response.resume();
        const nextUrl = new URL(location, url).toString();
        downloadUrlToFile({
          url: nextUrl,
          tempPath,
          onProgress,
          redirectCount: redirectCount + 1,
        }).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Download failed with status ${status}`));
        return;
      }

      const totalHeader = response.headers["content-length"];
      const totalBytes =
        typeof totalHeader === "string" && totalHeader.trim() !== "" ? Number(totalHeader) : null;
      let downloadedBytes = 0;
      const output = createWriteStream(tempPath);

      response.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        onProgress({
          downloadedBytes,
          totalBytes: totalBytes !== null && Number.isFinite(totalBytes) ? totalBytes : null,
        });
      });
      response.on("error", reject);
      output.on("error", reject);
      output.on("finish", () => resolve());
      response.pipe(output);
    });

    req.on("error", reject);
  });
}

export async function downloadReleaseAsset({
  downloadsDir,
  asset,
  downloader = downloadUrlToFile,
  onProgress = () => {},
}: {
  downloadsDir: string;
  asset: UpdateReleaseAsset;
  downloader?: FileDownloader;
  onProgress?: (progress: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">) => void;
}): Promise<DownloadResult> {
  const { finalPath, tempPath } = resolveDownloadTarget({ downloadsDir, asset });
  mkdirSync(dirname(finalPath), { recursive: true });

  if (isReusableFile(finalPath, asset.size)) {
    return { filePath: finalPath, reused: true };
  }

  rmSync(tempPath, { force: true });

  try {
    await downloader({
      url: asset.browserDownloadUrl,
      tempPath,
      onProgress,
    });

    if (asset.size !== null && asset.size > 0 && statSync(tempPath).size !== asset.size) {
      throw new Error("Downloaded file size did not match release asset size");
    }

    renameSync(tempPath, finalPath);
    return { filePath: finalPath, reused: false };
  } catch (error) {
    rmSync(tempPath, { force: true });
    rmSync(finalPath, { force: true });
    throw error;
  }
}
```

- [ ] **Step 4: Run download tests**

Run:

```bash
pnpm vitest run test/main/update/download.test.ts
```

Expected: PASS.

---

### Task 4: Update Manager

**Files:**

- Create: `src/main/update/manager.ts`
- Create: `test/main/update/manager.test.ts`

- [ ] **Step 1: Write update manager tests**

Create `test/main/update/manager.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@shared/result";
import type { UpdateState } from "@shared/update";
import { UpdateManager, type UpdateManagerDeps } from "@main/update/manager";
import type { GitHubRelease } from "@main/update/githubRelease";

vi.mock("electron", () => ({
  app: {
    getVersion: vi.fn(() => "1.0.0"),
    getPath: vi.fn(() => "/Users/test/Downloads"),
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(""),
  },
}));

function release(): GitHubRelease {
  return {
    tagName: "v1.0.1",
    name: "Sexy Worktree v1.0.1",
    htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
    draft: false,
    prerelease: false,
    publishedAt: "2026-05-07T00:00:00Z",
    assets: [
      {
        name: "Sexy Worktree-1.0.1-arm64.dmg",
        browserDownloadUrl: "https://example.com/app.dmg",
        size: 5,
        contentType: "application/x-apple-diskimage",
      },
    ],
  };
}

function createManager(overrides: Partial<UpdateManagerDeps> = {}): UpdateManager {
  return new UpdateManager({
    getCurrentVersion: () => "1.0.0",
    getDownloadsPath: () => "/Users/test/Downloads",
    fetchReleases: vi.fn().mockResolvedValue(ok([release()])),
    downloadAsset: vi
      .fn()
      .mockResolvedValue({ filePath: "/Users/test/Downloads/app.dmg", reused: false }),
    openPath: vi.fn().mockResolvedValue(""),
    now: () => 100,
    ...overrides,
  });
}

describe("UpdateManager", () => {
  it("emits available state when a newer release exists", async () => {
    const manager = createManager();
    const events: UpdateState[] = [];
    manager.onEvent((event) => events.push(event.state));

    const result = await manager.check({ silent: false });

    expect(result.ok).toBe(true);
    expect(manager.getState().phase).toBe("available");
    expect(events.map((event) => event.phase)).toEqual(["checking", "available"]);
  });

  it("does not emit startup noise when silent check finds no update", async () => {
    const manager = createManager({
      getCurrentVersion: () => "1.0.1",
    });
    const listener = vi.fn();
    manager.onEvent(listener);

    const result = await manager.check({ silent: true });

    expect(result).toEqual(
      ok({ state: { phase: "not-available", currentVersion: "1.0.1", checkedAt: 100 } })
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a typed error when release fetching fails", async () => {
    const manager = createManager({
      fetchReleases: vi
        .fn()
        .mockResolvedValue(err({ kind: "request-failed", message: "network down" })),
    });

    const result = await manager.check({ silent: false });

    expect(result).toEqual(err({ kind: "request-failed", message: "network down" }));
    expect(manager.getState()).toEqual({
      phase: "error",
      currentVersion: "1.0.0",
      checkedAt: 100,
      error: { kind: "request-failed", message: "network down" },
    });
  });

  it("downloads the available update, reports progress, opens the DMG, and stores downloaded state", async () => {
    const downloadAsset: UpdateManagerDeps["downloadAsset"] = vi.fn(async ({ onProgress }) => {
      onProgress({ downloadedBytes: 5, totalBytes: 5 });
      return { filePath: "/Users/test/Downloads/app.dmg", reused: false };
    });
    const openPath = vi.fn().mockResolvedValue("");
    const manager = createManager({ downloadAsset, openPath });
    const events: UpdateState[] = [];
    manager.onEvent((event) => events.push(event.state));

    await manager.check({ silent: false });
    const result = await manager.download();

    expect(result.ok).toBe(true);
    expect(downloadAsset).toHaveBeenCalledWith({
      downloadsDir: "/Users/test/Downloads",
      asset: expect.objectContaining({ name: "Sexy Worktree-1.0.1-arm64.dmg" }),
      onProgress: expect.any(Function),
    });
    expect(openPath).toHaveBeenCalledWith("/Users/test/Downloads/app.dmg");
    expect(manager.getState()).toEqual({
      phase: "downloaded",
      currentVersion: "1.0.0",
      update: expect.objectContaining({ tagName: "v1.0.1" }),
      filePath: "/Users/test/Downloads/app.dmg",
    });
    expect(events.map((event) => event.phase)).toContain("downloading");
    expect(events.at(-1)?.phase).toBe("downloaded");
  });

  it("returns not-available when download is requested before an update is available", async () => {
    const manager = createManager();

    await expect(manager.download()).resolves.toEqual(
      err({ kind: "not-available", message: "No update is available to download" })
    );
  });

  it("opens an already downloaded DMG", async () => {
    const openPath = vi.fn().mockResolvedValue("");
    const manager = createManager({ openPath });

    await manager.check({ silent: false });
    await manager.download();
    const result = await manager.openDownloaded();

    expect(result.ok).toBe(true);
    expect(openPath).toHaveBeenLastCalledWith("/Users/test/Downloads/app.dmg");
  });

  it("returns an open-failed error when macOS cannot open the DMG", async () => {
    const manager = createManager({
      openPath: vi.fn().mockResolvedValue("cannot open file"),
    });

    await manager.check({ silent: false });
    const result = await manager.download();

    expect(result).toEqual(err({ kind: "open-failed", message: "cannot open file" }));
    expect(manager.getState()).toEqual({
      phase: "error",
      currentVersion: "1.0.0",
      checkedAt: 100,
      error: { kind: "open-failed", message: "cannot open file" },
    });
  });
});
```

- [ ] **Step 2: Run manager tests and confirm they fail**

Run:

```bash
pnpm vitest run test/main/update/manager.test.ts
```

Expected: FAIL because `@main/update/manager` does not exist.

- [ ] **Step 3: Implement the update manager**

Create `src/main/update/manager.ts`:

```ts
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

type CheckOptions = {
  silent: boolean;
};

function toProgress({
  downloadedBytes,
  totalBytes,
}: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">): UpdateDownloadProgress {
  const percent =
    totalBytes !== null && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;
  return { downloadedBytes, totalBytes, percent };
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
  private readonly listeners = new Set<(event: UpdateEvent) => void>();

  constructor(private readonly deps: UpdateManagerDeps) {}

  getState(): UpdateState {
    return this.state;
  }

  onEvent(listener: (event: UpdateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(next: UpdateState, emit = true): UpdateState {
    this.state = next;
    if (emit) {
      const event: UpdateEvent = { state: next };
      for (const listener of this.listeners) listener(event);
    }
    return next;
  }

  async check(
    options: CheckOptions = { silent: false }
  ): Promise<Result<{ state: UpdateState }, UpdateError>> {
    const currentVersion = this.deps.getCurrentVersion();
    this.setState({ phase: "checking", currentVersion }, !options.silent);

    const releases = await this.deps.fetchReleases();
    if (!releases.ok) {
      const errorState: UpdateState = {
        phase: "error",
        currentVersion,
        checkedAt: this.deps.now(),
        error: releases.error,
      };
      this.setState(errorState, !options.silent);
      return err(releases.error);
    }

    const selected = selectLatestUpdate({
      releases: releases.value,
      currentVersion,
    });
    if (!selected.ok) {
      const errorState: UpdateState = {
        phase: "error",
        currentVersion,
        checkedAt: this.deps.now(),
        error: selected.error,
      };
      this.setState(errorState, !options.silent);
      return err(selected.error);
    }

    if (!selected.value) {
      const state = this.setState(
        { phase: "not-available", currentVersion, checkedAt: this.deps.now() },
        !options.silent
      );
      return ok({ state });
    }

    const state = this.setState({
      phase: "available",
      currentVersion,
      checkedAt: this.deps.now(),
      update: selected.value,
    });
    return ok({ state });
  }

  async download(): Promise<Result<{ state: UpdateState }, UpdateError>> {
    if (this.state.phase === "downloaded") {
      return await this.openDownloaded();
    }
    if (this.state.phase !== "available") {
      return err({ kind: "not-available", message: "No update is available to download" });
    }

    const { currentVersion, update } = this.state;
    const progress = toProgress({ downloadedBytes: 0, totalBytes: update.asset.size });
    this.setState({ phase: "downloading", currentVersion, update, progress });

    try {
      const result = await this.deps.downloadAsset({
        downloadsDir: this.deps.getDownloadsPath(),
        asset: update.asset,
        onProgress: (event) => {
          this.setState({
            phase: "downloading",
            currentVersion,
            update,
            progress: toProgress(event),
          });
        },
      });

      const openError = await this.deps.openPath(result.filePath);
      if (openError) {
        const error = { kind: "open-failed" as const, message: openError };
        this.setState({ phase: "error", currentVersion, checkedAt: this.deps.now(), error });
        return err(error);
      }

      const state = this.setState({
        phase: "downloaded",
        currentVersion,
        update,
        filePath: result.filePath,
      });
      return ok({ state });
    } catch (error) {
      const updateError = errorFromUnknown("download-failed", "Update download failed", error);
      this.setState({
        phase: "error",
        currentVersion,
        checkedAt: this.deps.now(),
        error: updateError,
      });
      return err(updateError);
    }
  }

  async openDownloaded(): Promise<Result<{ state: UpdateState }, UpdateError>> {
    if (this.state.phase !== "downloaded") {
      return err({ kind: "not-available", message: "No downloaded update is available to open" });
    }

    const openError = await this.deps.openPath(this.state.filePath);
    if (openError) {
      const error = { kind: "open-failed" as const, message: openError };
      this.setState({
        phase: "error",
        currentVersion: this.state.currentVersion,
        checkedAt: this.deps.now(),
        error,
      });
      return err(error);
    }

    return ok({ state: this.state });
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
```

- [ ] **Step 4: Run manager tests**

Run:

```bash
pnpm vitest run test/main/update/manager.test.ts
```

Expected: PASS.

---

### Task 5: Main IPC And Packaged Startup Check

**Files:**

- Create: `src/main/ipc/update.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Create: `test/main/ipc/update.test.ts`

- [ ] **Step 1: Write update IPC tests**

Create `test/main/ipc/update.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { ok } from "@shared/result";
import type { UpdateEvent, UpdateState } from "@shared/update";

type IpcHandler = (_event: unknown, args?: unknown) => Promise<unknown>;
type Listener = (event: UpdateEvent) => void;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  manager: {
    listeners: [] as Listener[],
    getState: vi.fn(),
    check: vi.fn(),
    download: vi.fn(),
    openDownloaded: vi.fn(),
    onEvent: vi.fn((listener: Listener) => {
      mocks.manager.listeners.push(listener);
      return () => {
        mocks.manager.listeners = mocks.manager.listeners.filter((current) => current !== listener);
      };
    }),
    emit(event: UpdateEvent) {
      for (const listener of mocks.manager.listeners) listener(event);
    },
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock("@main/update/manager", () => ({
  updateManager: mocks.manager,
}));

function handler(channel: string): IpcHandler {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return registered;
}

async function setup(getWindow: () => BrowserWindow | null = () => null): Promise<void> {
  vi.resetModules();
  mocks.handlers.clear();
  mocks.manager.listeners = [];
  const module = await import("@main/ipc/update");
  module.registerUpdateHandlers(getWindow);
}

describe("update IPC handlers", () => {
  const state: UpdateState = { phase: "idle" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.manager.getState.mockReturnValue(state);
    mocks.manager.check.mockResolvedValue(ok({ state }));
    mocks.manager.download.mockResolvedValue(ok({ state }));
    mocks.manager.openDownloaded.mockResolvedValue(ok({ state }));
  });

  it("registers update handlers and returns manager state", async () => {
    await setup();

    await expect(handler("update:getState")(null)).resolves.toEqual(ok({ state }));
    await expect(handler("update:check")(null)).resolves.toEqual(ok({ state }));
    await expect(handler("update:download")(null)).resolves.toEqual(ok({ state }));
    await expect(handler("update:openDownloaded")(null)).resolves.toEqual(ok({ state }));

    expect(mocks.manager.check).toHaveBeenCalledWith({ silent: false });
    expect(mocks.manager.download).toHaveBeenCalledTimes(1);
    expect(mocks.manager.openDownloaded).toHaveBeenCalledTimes(1);
  });

  it("forwards update events to the current BrowserWindow", async () => {
    const send = vi.fn();
    await setup(() => ({ webContents: { send } }) as unknown as BrowserWindow);

    mocks.manager.emit({ state });

    expect(send).toHaveBeenCalledWith("update:event", { state });
  });

  it("does not send events when there is no window", async () => {
    await setup(() => null);

    expect(() => mocks.manager.emit({ state })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run update IPC tests and confirm they fail**

Run:

```bash
pnpm vitest run test/main/ipc/update.test.ts
```

Expected: FAIL because `@main/ipc/update` does not exist.

- [ ] **Step 3: Implement update IPC handlers**

Create `src/main/ipc/update.ts`:

```ts
import { ipcMain, type BrowserWindow } from "electron";
import { ok } from "@shared/result";
import type { AppUpdateEvent, IpcOut } from "@shared/ipc";
import { updateManager } from "../update/manager";

let getWindowForUpdateEvents: (() => BrowserWindow | null) | null = null;
let unsubscribeUpdateEvents: (() => void) | null = null;

export function registerUpdateHandlers(getWindow: () => BrowserWindow | null): void {
  getWindowForUpdateEvents = getWindow;

  if (!unsubscribeUpdateEvents) {
    unsubscribeUpdateEvents = updateManager.onEvent((event) => {
      const win = getWindowForUpdateEvents?.();
      if (!win) return;
      const evt: AppUpdateEvent = event;
      win.webContents.send("update:event", evt);
    });
  }

  ipcMain.handle("update:getState", async (): Promise<IpcOut<"update:getState">> => {
    return ok({ state: updateManager.getState() });
  });

  ipcMain.handle("update:check", async (): Promise<IpcOut<"update:check">> => {
    return await updateManager.check({ silent: false });
  });

  ipcMain.handle("update:download", async (): Promise<IpcOut<"update:download">> => {
    return await updateManager.download();
  });

  ipcMain.handle("update:openDownloaded", async (): Promise<IpcOut<"update:openDownloaded">> => {
    return await updateManager.openDownloaded();
  });
}
```

- [ ] **Step 4: Register update IPC**

In `src/main/ipc/index.ts`, add:

```ts
import { registerUpdateHandlers } from "./update";
```

Then call it inside `registerIpc(getWindow)`:

```ts
registerUpdateHandlers(getWindow);
```

Place the call after `registerRecentsHandlers()` or near other app-level registrations.

- [ ] **Step 5: Start a silent packaged update check**

In `src/main/index.ts`, add this import:

```ts
import { updateManager } from "./update/manager";
```

After `await createWindow();` inside `app.whenReady().then(async () => { ... })`, add:

```ts
if (app.isPackaged) {
  setTimeout(() => {
    void updateManager.check({ silent: true });
  }, 3000);
}
```

The development app must not check GitHub on startup because `app.isPackaged` is false under `pnpm dev`.

- [ ] **Step 6: Run IPC tests**

Run:

```bash
pnpm vitest run test/main/ipc/update.test.ts
```

Expected: PASS.

---

### Task 6: Toast Actions

**Files:**

- Modify: `src/renderer/state/toast.tsx`
- Modify: `src/renderer/toast/Toast.tsx`
- Create: `test/renderer/toast/Toast.test.tsx`

- [ ] **Step 1: Write toast action test**

Create `test/renderer/toast/Toast.test.tsx`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mountToast(action: () => void): Promise<{ unmount: () => void }> {
  vi.resetModules();
  const [{ ToastProvider, useToast }, { ToastLayer }] = await Promise.all([
    import("@renderer/state/toast"),
    import("@renderer/toast/Toast"),
  ]);

  function Probe(): null {
    const { push } = useToast();
    useEffect(() => {
      push({
        kind: "warning",
        title: "Sexy Worktree v1.0.1 available",
        description: "Download the DMG to install it.",
        action: { label: "Download update", onClick: action },
      });
    }, [push]);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(ToastProvider, null, createElement(Probe), createElement(ToastLayer))
    );
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("ToastLayer", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("renders and invokes toast actions", async () => {
    const action = vi.fn();
    const mounted = await mountToast(action);
    cleanup = mounted.unmount;

    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Download update"
    ) as HTMLButtonElement | undefined;

    expect(button).toBeTruthy();
    await act(async () => {
      button?.click();
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run toast test and confirm it fails**

Run:

```bash
pnpm vitest run test/renderer/toast/Toast.test.tsx
```

Expected: FAIL because `Toast` has no `action` field and `ToastLayer` renders no action button.

- [ ] **Step 3: Add action metadata and an update helper to toast state**

In `src/renderer/state/toast.tsx`, add this type:

```ts
export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};
```

Add the optional action to `Toast`:

```ts
  action?: ToastAction;
```

Add `update` to the internal `State` type:

```ts
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
```

Inside `ToastProvider`, add this callback after `dismiss`:

```ts
const update = useCallback(
  (id: string, patch: Partial<Omit<Toast, "id">>) =>
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))),
  []
);
```

Return the helper from the provider:

```tsx
return <Ctx.Provider value={{ toasts, push, update, dismiss }}>{children}</Ctx.Provider>;
```

- [ ] **Step 4: Render toast actions**

In `src/renderer/toast/Toast.tsx`, add this constant near `VARIANT_BORDER`:

```ts
const ACTION_BUTTON_CLASS =
  "border-border-strong bg-background text-text-secondary hover:bg-elevated hover:text-text-primary focus-visible:outline-accent-soft rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2";
```

Inside the toast body, after the optional description, add:

```tsx
{
  t.action && (
    <button
      type="button"
      className={`${ACTION_BUTTON_CLASS} mt-2`}
      onClick={() => {
        void t.action?.onClick();
        dismiss(t.id);
      }}
    >
      {t.action.label}
    </button>
  );
}
```

- [ ] **Step 5: Run toast test**

Run:

```bash
pnpm vitest run test/renderer/toast/Toast.test.tsx
```

Expected: PASS.

---

### Task 7: Renderer Update Provider And App Wiring

**Files:**

- Create: `src/renderer/state/update.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `test/renderer/state/update.test.tsx`

- [ ] **Step 1: Write update provider tests**

Create `test/renderer/state/update.test.tsx`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/result";
import type { AppUpdateEvent } from "@shared/ipc";
import type { UpdateState } from "@shared/update";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ToastRecord = {
  kind: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void | Promise<void> };
  durationMs?: number;
};

type CapturedUpdateState = {
  state: UpdateState;
  check: () => Promise<void>;
  download: () => Promise<void>;
  openDownloaded: () => Promise<void>;
};

const toasts: ToastRecord[] = [];
const toastUpdates: Array<{ id: string; patch: Partial<ToastRecord> }> = [];
const dismissedToasts: string[] = [];

const availableState: UpdateState = {
  phase: "available",
  currentVersion: "1.0.0",
  checkedAt: 100,
  update: {
    version: "1.0.1",
    tagName: "v1.0.1",
    releaseName: "Sexy Worktree v1.0.1",
    htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
    publishedAt: "2026-05-07T00:00:00Z",
    asset: {
      name: "Sexy Worktree-1.0.1-arm64.dmg",
      browserDownloadUrl: "https://example.com/app.dmg",
      size: 5,
      contentType: "application/x-apple-diskimage",
    },
  },
};

const downloadingState: UpdateState = {
  phase: "downloading",
  currentVersion: "1.0.0",
  update: availableState.update,
  progress: { downloadedBytes: 4, totalBytes: 5, percent: 80 },
};

const downloadedState: UpdateState = {
  phase: "downloaded",
  currentVersion: "1.0.0",
  update: availableState.update,
  filePath: "/Users/test/Downloads/app.dmg",
};

function makeApi(events: { handler: ((event: AppUpdateEvent) => void) | null }): typeof window.api {
  return {
    dialog: { selectDirectory: vi.fn() },
    repo: {
      openDialog: vi.fn(),
      validate: vi.fn(),
      add: vi.fn(),
      list: vi.fn(),
      setActive: vi.fn(),
      close: vi.fn(),
    },
    worktree: { list: vi.fn(), remove: vi.fn() },
    config: { get: vi.fn(), saveJira: vi.fn(), saveRepository: vi.fn() },
    pty: {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    pane: { load: vi.fn(), save: vi.fn() },
    overviewGridDensity: { get: vi.fn(), set: vi.fn() },
    update: {
      getState: vi.fn().mockResolvedValue(ok({ state: { phase: "idle" } as UpdateState })),
      check: vi.fn(),
      download: vi
        .fn()
        .mockResolvedValue(
          ok({
            state: {
              phase: "downloaded",
              currentVersion: "1.0.0",
              update: availableState.update,
              filePath: "/Users/test/Downloads/app.dmg",
            } as UpdateState,
          })
        ),
      openDownloaded: vi.fn(),
      onEvent: vi.fn((handler: (event: AppUpdateEvent) => void) => {
        events.handler = handler;
        return () => {
          if (events.handler === handler) events.handler = null;
        };
      }),
    },
    newWorktree: {
      create: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    worktreeDelete: {
      start: vi.fn(),
      cancel: vi.fn(),
      dismiss: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    secrets: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    jira: { resolve: vi.fn() },
    recents: { list: vi.fn() },
  } satisfies typeof window.api;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountProvider(): Promise<{
  api: typeof window.api;
  emit: (event: AppUpdateEvent) => Promise<void>;
  latest: () => CapturedUpdateState;
  unmount: () => void;
}> {
  vi.resetModules();
  const events: { handler: ((event: AppUpdateEvent) => void) | null } = { handler: null };
  window.api = makeApi(events);
  toasts.length = 0;
  toastUpdates.length = 0;
  dismissedToasts.length = 0;

  vi.doMock("@renderer/state/toast", () => ({
    useToast: () => ({
      toasts: [],
      dismiss: (id: string) => {
        dismissedToasts.push(id);
      },
      update: (id: string, patch: Partial<ToastRecord>) => {
        toastUpdates.push({ id, patch });
        const index = Number(id.replace("toast-", "")) - 1;
        const current = toasts[index];
        if (current) toasts[index] = { ...current, ...patch };
      },
      push: (toast: ToastRecord) => {
        toasts.push(toast);
        return `toast-${toasts.length}`;
      },
    }),
  }));

  const module = await import("@renderer/state/update");
  let state: CapturedUpdateState | null = null;

  function Probe(): null {
    state = module.useUpdate();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(module.UpdateProvider, null, createElement(Probe)));
  });
  await flush();

  return {
    api: window.api,
    emit: async (event) => {
      if (!events.handler) throw new Error("update event handler was not registered");
      await act(async () => {
        events.handler?.(event);
      });
      await flush();
    },
    latest: () => {
      if (!state) throw new Error("state was not captured");
      return state;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("UpdateProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/toast");
    vi.restoreAllMocks();
  });

  it("loads initial update state and subscribes to events", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.api.update.getState).toHaveBeenCalledTimes(1);
    expect(mounted.api.update.onEvent).toHaveBeenCalledTimes(1);
    expect(mounted.latest().state.phase).toBe("idle");
  });

  it("shows an actionable toast when an update becomes available", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({ state: availableState });

    expect(mounted.latest().state).toEqual(availableState);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      kind: "warning",
      title: "Sexy Worktree v1.0.1 available",
      description: "Download the DMG to install it.",
      action: { label: "Download update" },
    });
  });

  it("downloads when the update toast action is clicked", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({ state: availableState });
    await act(async () => {
      await toasts[0]?.action?.onClick();
    });
    await flush();

    expect(mounted.api.update.download).toHaveBeenCalledTimes(1);
  });

  it("shows determinate progress while downloading", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({ state: downloadingState });

    expect(toasts.at(-1)).toMatchObject({
      kind: "progress",
      title: "Downloading update",
      description: "80%",
    });
  });

  it("dismisses progress and shows success after the DMG is opened", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({ state: downloadingState });
    await mounted.emit({ state: downloadedState });

    expect(dismissedToasts).toEqual(["toast-1"]);
    expect(toasts.at(-1)).toMatchObject({
      kind: "success",
      title: "Update DMG opened",
      description: "Finish installing from the opened DMG.",
      durationMs: 5000,
    });
  });

  it("shows an error toast when download fails", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    vi.mocked(mounted.api.update.download).mockResolvedValueOnce(
      err({ kind: "download-failed", message: "network down" })
    );

    await act(async () => {
      await mounted.latest().download();
    });
    await flush();

    expect(toasts.at(-1)).toEqual({
      kind: "error",
      title: "Update download failed",
      description: "network down",
      durationMs: 5000,
    });
  });
});
```

- [ ] **Step 2: Run update provider tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/state/update.test.tsx
```

Expected: FAIL because `@renderer/state/update` does not exist.

- [ ] **Step 3: Implement update provider**

Create `src/renderer/state/update.tsx`:

```tsx
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
import type { UpdateState } from "@shared/update";
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

function progressDescription(state: Extract<UpdateState, { phase: "downloading" }>): string {
  if (state.progress.percent !== null) return `${state.progress.percent}%`;
  const mb = Math.max(0, state.progress.downloadedBytes / 1024 / 1024).toFixed(1);
  return `${mb} MB downloaded`;
}

export function UpdateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const { push: pushToast, update: updateToast, dismiss: dismissToast } = useToast();
  const notifiedTagRef = useRef<string | null>(null);
  const progressToastIdRef = useRef<string | null>(null);
  const openedFilePathRef = useRef<string | null>(null);
  const downloadRef = useRef<() => Promise<void>>(async () => {});

  const pushError = useCallback(
    (title: string, message: string): void => {
      pushToast({
        kind: "error",
        title,
        description: message,
        durationMs: 5000,
      });
    },
    [pushToast]
  );

  const dismissProgressToast = useCallback((): void => {
    if (!progressToastIdRef.current) return;
    dismissToast(progressToastIdRef.current);
    progressToastIdRef.current = null;
  }, [dismissToast]);

  const notifyAvailable = useCallback(
    (next: UpdateState): void => {
      if (!isAvailable(next)) return;
      if (notifiedTagRef.current === next.update.tagName) return;
      notifiedTagRef.current = next.update.tagName;
      pushToast({
        kind: "warning",
        title: `Sexy Worktree ${next.update.tagName} available`,
        description: "Download the DMG to install it.",
        action: {
          label: "Download update",
          onClick: () => downloadRef.current(),
        },
      });
    },
    [pushToast]
  );

  const notifyDownloadProgress = useCallback(
    (next: UpdateState): void => {
      if (!isDownloading(next)) return;
      const patch = {
        kind: "progress" as const,
        title: "Downloading update",
        description: progressDescription(next),
      };
      if (!progressToastIdRef.current) {
        progressToastIdRef.current = pushToast(patch);
        return;
      }
      updateToast(progressToastIdRef.current, patch);
    },
    [pushToast, updateToast]
  );

  const notifyDownloaded = useCallback(
    (next: UpdateState): void => {
      if (!isDownloaded(next)) return;
      if (openedFilePathRef.current === next.filePath) return;
      openedFilePathRef.current = next.filePath;
      dismissProgressToast();
      pushToast({
        kind: "success",
        title: "Update DMG opened",
        description: "Finish installing from the opened DMG.",
        durationMs: 5000,
      });
    },
    [dismissProgressToast, pushToast]
  );

  const applyState = useCallback(
    (next: UpdateState): void => {
      setState(next);
      notifyAvailable(next);
      notifyDownloadProgress(next);
      notifyDownloaded(next);
    },
    [notifyAvailable, notifyDownloadProgress, notifyDownloaded]
  );

  const check = useCallback(async (): Promise<void> => {
    const result = await api.update.check();
    if (result.ok) {
      applyState(result.value.state);
      return;
    }
    pushError("Update check failed", result.error.message);
  }, [applyState, pushError]);

  const download = useCallback(async (): Promise<void> => {
    const result = await api.update.download();
    if (result.ok) {
      applyState(result.value.state);
      return;
    }
    dismissProgressToast();
    pushError("Update download failed", result.error.message);
  }, [applyState, dismissProgressToast, pushError]);

  const openDownloaded = useCallback(async (): Promise<void> => {
    const result = await api.update.openDownloaded();
    if (result.ok) {
      applyState(result.value.state);
      return;
    }
    pushError("Failed to open update", result.error.message);
  }, [applyState, pushError]);

  downloadRef.current = download;

  useEffect(() => {
    let cancelled = false;

    void api.update.getState().then((result) => {
      if (cancelled || !result.ok) return;
      applyState(result.value.state);
    });

    const unsubscribe = api.update.onEvent((event) => {
      applyState(event.state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyState]);

  const value = useMemo<State>(
    () => ({ state, check, download, openDownloaded }),
    [state, check, download, openDownloaded]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUpdate(): State {
  const value = useContext(Ctx);
  if (!value) throw new Error("useUpdate must be inside <UpdateProvider>");
  return value;
}
```

- [ ] **Step 4: Wire provider into App**

In `src/renderer/App.tsx`, add:

```ts
import { UpdateProvider } from "./state/update";
```

Wrap the existing app tree directly inside `ToastProvider`:

```tsx
<ToastProvider>
  <UpdateProvider>
    <ReposProvider>{/* existing providers remain inside ReposProvider */}</ReposProvider>
  </UpdateProvider>
</ToastProvider>
```

Keep `ToastLayer` inside `Shell` so the existing visual placement is unchanged.

- [ ] **Step 5: Run renderer update tests**

Run:

```bash
pnpm vitest run test/renderer/toast/Toast.test.tsx test/renderer/state/update.test.tsx
```

Expected: PASS.

---

### Task 8: Documentation And Verification

**Files:**

- Modify: `docs/release.md`

- [ ] **Step 1: Document the free update checker**

In `docs/release.md`, add this section after `Public Downloads`:

```md
## In-App Update Checker

Packaged builds check the public GitHub Releases feed for newer stable tags.
When a newer arm64 DMG is available, the app shows an update toast. Clicking
the update action downloads the DMG to the user's Downloads folder and opens it
when the download completes.

This is not a fully automatic updater. The app does not replace its own
`.app` bundle, does not restart itself, and does not modify `/Applications`.
The user still installs the update by dragging `Sexy Worktree.app` from the DMG
into Applications.

The current free update checker does not require Apple Developer Program
membership, Developer ID signing, notarization, `electron-updater`, or GitHub
tokens. When Developer ID signing and notarization are added, this release
tag flow can be reused as the foundation for a full automatic updater.
```

- [ ] **Step 2: Run focused main tests**

Run:

```bash
pnpm vitest run test/main/update test/main/ipc/update.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused renderer tests**

Run:

```bash
pnpm vitest run test/renderer/toast/Toast.test.tsx test/renderer/state/update.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS after every renderer API mock listed in Task 1 Step 5 includes the `update` property.

- [ ] **Step 5: Run full tests**

Run:

```bash
pnpm test
```

Expected: PASS. This command rebuilds native modules for Node, runs Vitest, then rebuilds native modules for Electron.

- [ ] **Step 6: Manual packaged verification**

Create a release only when explicitly instructed by the user. Without creating tags or releases, verify the packaged app starts:

```bash
pnpm dist:mac:dir
```

Expected: PASS and an unpacked macOS app under `dist/mac-arm64/`. Because local ad-hoc builds are not a newer GitHub Release, this command verifies packaging only. A real update check requires a public GitHub Release whose tag is greater than the app's current `package.json` version.

---

## Self-Review Checklist

- Spec coverage:
  - Public GitHub Release source is implemented by `fetchGitHubReleases` and `UPDATE_REPOSITORY`.
  - Stable release filtering, semver comparison, and arm64 DMG selection are covered by Task 2.
  - Downloads folder, temporary file, size validation, reuse, and DMG opening are covered by Tasks 3 and 4.
  - Typed IPC and renderer event subscription are covered by Tasks 1, 5, and 7.
  - Determinate and indeterminate download feedback is covered by toast updates in Tasks 6 and 7.
  - Startup-only packaged check is covered by Task 5.
  - Apple Developer ID, notarization, self-replacement, and automatic restart remain outside scope.
- Marker scan:
  - The plan contains no incomplete markers or open-ended implementation notes.
- Type consistency:
  - Shared DTO names are `UpdateState`, `UpdateInfo`, `UpdateError`, `UpdateEvent`, and `UpdateDownloadProgress`.
  - IPC channels are consistently named `update:getState`, `update:check`, `update:download`, `update:openDownloaded`, and `update:event`.
  - Renderer API namespace is consistently `api.update`.
