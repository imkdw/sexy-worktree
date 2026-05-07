# Release Guide

This project publishes macOS installers through GitHub Releases.

## Build Locally

Run the full macOS packaging command:

```bash
pnpm dist:mac
```

The ad-hoc-signed Apple Silicon DMG is written to `dist/`.

For a quick unpacked app build:

```bash
pnpm dist:mac:dir
```

## Publish A Release

`package.json` is the source of truth for the app version. The release tag must match that version with a leading `v`.

Example patch release:

```bash
pnpm version patch --no-git-tag-version
pnpm install --lockfile-only
git add package.json pnpm-lock.yaml
git commit -m "chore: release v1.0.1"
git tag v1.0.1
git push origin HEAD
git push origin v1.0.1
```

When the `v1.0.1` tag is pushed, the `macOS Release` workflow:

1. Installs dependencies.
2. Runs typecheck, lint, and tests.
3. Builds the ad-hoc-signed arm64 DMG.
4. Uploads the DMG to the workflow artifacts.
5. Publishes the DMG to the matching GitHub Release.

The workflow fails before publishing if the tag does not match `package.json`. For example, `package.json` version `1.0.1` must use tag `v1.0.1`.

## Public Downloads

Use the GitHub Releases page as the public download surface. If the repository is public, anyone can download the DMG release asset. If the repository is private, only users with repository access can download it.

Manual workflow runs are for internal checks. Their artifacts expire and may require repository access, so they are not the public distribution path.

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

## Opening The App

The first iteration is ad-hoc signed and not notarized. On macOS, first launch can show a Gatekeeper warning.

For personal builds without Developer ID notarization:

1. Open the downloaded DMG.
2. Drag `Sexy Worktree.app` to Applications.
3. In Finder, right-click `Sexy Worktree.app`.
4. Choose Open.
5. Confirm Open in the macOS warning dialog.

Later releases can add Developer ID signing and Apple notarization.

## Agent Safety

Do not create release commits or tags automatically unless the user explicitly asks for those git operations.
