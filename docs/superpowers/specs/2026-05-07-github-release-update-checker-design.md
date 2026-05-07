# GitHub Release Update Checker Design

## Goal

Add a free macOS update flow that checks public GitHub Releases for newer app versions, downloads the matching DMG to the user's Downloads folder, and opens the DMG when the download completes.

This feature should make updates easier without requiring Apple Developer Program membership, Developer ID signing, notarization, or a fully automatic self-replacing updater.

## Current State

- The app is packaged with `electron-builder` as an Apple Silicon macOS DMG.
- `electron-builder.yml` uses `identity: "-"`, so the app is ad-hoc signed rather than Developer ID signed.
- `.github/workflows/macos-release.yml` builds a DMG when a `v*` tag is pushed.
- The release workflow validates that `GITHUB_REF_NAME` matches `package.json` version with a leading `v`.
- The workflow publishes the DMG to the matching GitHub Release.
- `docs/release.md` documents GitHub Releases as the public download surface.
- There is no `electron-updater` dependency and no runtime update code.
- `src/main/index.ts` owns Electron app startup, IPC registration, and main window lifecycle.
- Renderer code accesses privileged operations only through typed `window.api`.

## Chosen Model

Use a custom GitHub Release update checker instead of `electron-updater` for the first free version.

The app will:

- Check the public `imkdw/sexy-worktree` GitHub Releases API.
- Compare the latest stable release tag against `app.getVersion()`.
- Ignore draft and prerelease releases.
- Select the latest macOS arm64 DMG asset.
- Notify the renderer when a newer version is available.
- Download the DMG to `~/Downloads` only after the user clicks the update action.
- Open the downloaded DMG after the download succeeds.

The app will not replace its own `.app` bundle or restart itself. Manual drag-and-drop installation from the DMG remains the final update step.

## User Experience

On packaged app startup, the main process checks for updates after the main window has been created. The check should be quiet unless a newer version is available or the user explicitly requested a check.

When an update is available, the renderer shows a compact toast using the existing toast system. The toast should communicate the version and offer a clear action:

- New version available: `v1.0.1`
- Action: `Download update`

When the user clicks the action, the app downloads the DMG into the Downloads folder. During download, the UI shows determinate progress when the main process can compute content-length. If content-length is unavailable, the UI shows an indeterminate downloading state rather than blocking the flow.

When the download completes, the app opens the DMG with macOS default behavior. The user then drags `Sexy Worktree.app` into Applications to replace the previous version.

If the same version DMG already exists in Downloads, the app opens that existing file instead of downloading it again. A failed partial download must not be treated as reusable because downloads are written to a temporary filename and renamed only after success.

## Architecture

Add an update domain owned by the Electron main process.

Expected main-process modules:

- `src/main/update/githubRelease.ts`: fetches and normalizes GitHub Release metadata.
- `src/main/update/version.ts`: compares release tags and current app versions.
- `src/main/update/download.ts`: downloads release assets to a temporary file, emits progress, and renames on success.
- `src/main/update/manager.ts`: coordinates checking, state transitions, download start, and DMG opening.

Expected shared module:

- `src/shared/update.ts`: serializable update DTOs and error unions shared across main, preload, and renderer.

Expected renderer module:

- `src/renderer/state/update.tsx`: subscribes to update events, exposes update state/actions, and triggers toasts.

The main process is the only layer that performs network requests, filesystem writes, or shell operations for updates. The renderer only shows state and sends typed user actions through IPC.

## IPC Contract

Add typed IPC channels using the existing `Result` envelope pattern.

Expected operations:

- `update:getState`: return the current update state.
- `update:check`: manually check for updates.
- `update:download`: start downloading the currently available update.
- `update:openDownloaded`: open the already downloaded DMG, if present.

Expected event:

- `update:event`: push state changes to renderer subscribers.

State should cover these phases:

- `idle`
- `checking`
- `not-available`
- `available`
- `downloading`
- `downloaded`
- `error`

Download progress should include downloaded bytes and total bytes when available. The event payload must remain serializable and safe to expose through preload.

## GitHub Release Selection

The release source is the public GitHub repository:

- Owner: `imkdw`
- Repo: `sexy-worktree`

The checker uses the GitHub Releases API without authentication. No token is stored and no GitHub credential UI is added.

Selection rules:

- Ignore draft releases.
- Ignore prereleases.
- Accept tags matching `vX.Y.Z` or other valid semver-compatible versions with a leading `v`.
- Treat malformed tags as non-candidates.
- Pick the highest version greater than `app.getVersion()`.
- Pick a release asset whose name ends with `.dmg` and includes `arm64`.

If no matching DMG asset exists, the checker returns an update error rather than opening the release page. This keeps the MVP focused on the DMG download flow.

## Download Behavior

Downloads go to the user's Downloads folder through `app.getPath("downloads")`.

The final filename should use the GitHub asset filename. The downloader must first write to a temporary filename in the same directory, then rename it to the final DMG path only after the download completes successfully.

Expected behavior:

- Existing complete final DMG for the same version is reused.
- Partial temporary files are overwritten or removed on the next attempt.
- Network failures leave no final DMG behind.
- Filesystem write failures surface as update errors.
- After a successful download, the main process opens the DMG with Electron `shell.openPath()`.

The app should not mount the DMG itself, copy the `.app` bundle, remove quarantine attributes, request elevated permissions, or modify `/Applications`.

## Error Handling

Update failures must not block normal app use.

Expected errors:

- GitHub request failed.
- GitHub API returned malformed data.
- GitHub API rate limit was reached.
- Release tag could not be parsed.
- No compatible DMG asset exists.
- Download failed.
- Downloads folder is not writable.
- Opening the DMG failed.

Automatic startup checks should fail quietly. Manual checks should return a clear result because the user explicitly asked for feedback.

The update manager should keep the last known state in memory for the current app session. No SQLite migration is required for this feature.

## Release Pipeline

Keep the current release trigger model:

1. Update `package.json` version.
2. Push a matching `vX.Y.Z` tag.
3. GitHub Actions validates the tag against `package.json`.
4. GitHub Actions builds the macOS DMG.
5. GitHub Actions publishes the DMG to the matching GitHub Release.

The current artifact naming pattern in `electron-builder.yml` is compatible:

```text
${productName}-${version}-${arch}.${ext}
```

For the current macOS target, that produces a name like:

```text
Sexy Worktree-1.0.1-arm64.dmg
```

No `latest-mac.yml`, blockmap, auto-install metadata, Developer ID certificate, or notarization setup is required for this free update checker.

## Development Mode

Automatic update checks are disabled by default in development mode.

Tests should use injected release clients and download helpers rather than making live GitHub requests. The default `pnpm dev` flow must not call GitHub on startup.

## Testing

Main process tests:

- Current `1.0.0` with release tag `v1.0.1` reports update available.
- Current `1.0.1` with release tag `v1.0.1` reports no update.
- Draft and prerelease releases are ignored.
- Malformed tags are ignored.
- Highest valid version greater than current is selected.
- Missing arm64 DMG asset returns a typed error.
- Existing complete DMG path is reused.
- Temporary download path is renamed only after success.
- Download failure does not leave a final DMG path.
- `update:*` IPC handlers return `Result` values for expected failures.

Renderer tests:

- Provider subscribes to `update:event` and stores the latest state.
- Available update event triggers an actionable toast.
- Download action calls `update:download`.
- Downloaded state records the downloaded DMG path after the main process opens it.
- Error state does not crash the app shell.

Verification commands after implementation:

```bash
pnpm typecheck
pnpm vitest run test/main test/renderer
pnpm test
```

The exact focused test command may be narrowed during implementation to the files actually touched, but typecheck and impacted Vitest coverage are required.

## Non-Goals

- No Apple Developer Program enrollment.
- No Developer ID signing.
- No Apple notarization.
- No `electron-updater` automatic install flow.
- No automatic app restart.
- No self-replacement of the running `.app` bundle.
- No private GitHub repository support.
- No GitHub token storage.
- No prerelease update channel.
- No Windows or Linux update support.
- No SQLite persistence for update state.
- No release creation, git commit, branch, or tag automation inside the app.

## Open Decisions Resolved

- Use GitHub Release/tag versions, not every `main` branch push.
- Use the public repository `imkdw/sexy-worktree`.
- Use automatic startup checks only in packaged builds.
- Notify through renderer UI and require a user click before downloading.
- Download the DMG to the Downloads folder.
- Open the DMG after successful download.
- Leave final app replacement to the user.
- Keep the design compatible with future Developer ID signing and `electron-updater`, but do not implement those now.
