# SHARED CONTRACTS KNOWLEDGE

## OVERVIEW

`src/shared` is the public contract layer between main, preload, renderer, persistence, and tests. Treat changes here as cross-process API changes, not local utility edits.

## WHERE TO LOOK

| Task                       | Location                              | Notes                                          |
| -------------------------- | ------------------------------------- | ---------------------------------------------- |
| IPC request/response       | `ipc.ts`                              | Authoritative channel map and DTOs             |
| Result envelope            | `result.ts`                           | Expected failure shape for IPC/services        |
| Pane persistence/rendering | `pane.ts`, `paneOps.ts`, `paneNav.ts` | JSON stored in SQLite and rendered by renderer |
| New worktree jobs          | `newWorktree.ts`                      | Step order, statuses, job events               |
| Branch validation          | `branchValidation.ts`                 | Shared by renderer forms and main enforcement  |

## CONVENTIONS

- Keep modules runtime-safe for both main and renderer: no Electron, Node-only, DOM, React, or database imports.
- Prefer serializable DTOs, discriminated unions, and pure helpers.
- IPC channels in `IpcChannels` use `{ in, out }`; outputs are normally `Result<value, error>`.
- Expected failures use `Result<T,E>` from `result.ts`, not thrown exceptions or alternate envelopes.
- Add pure helpers here only when logic must be shared across process/UI boundaries; otherwise keep feature-local code in main or renderer.

## UPDATE TOGETHER

- New/changed IPC channel: `ipc.ts`, `src/main/ipc/<domain>.ts`, `src/main/ipc/index.ts` if new module, `src/preload/index.ts`, `src/renderer/ipc/api.ts`, renderer call sites, tests.
- New push event: shared payload type, main sender, preload listener, renderer API type, renderer consumer. Event channel names are duplicated strings today.
- Pane shape change: `pane.ts`, `paneOps.ts`, `paneNav.ts`, `src/renderer/state/terminalSessions.tsx`, `src/renderer/card/PaneTree.tsx`, `src/main/db/panes.ts`, and migration/backfill if existing JSON is incompatible.
- Branch validation change: renderer direct/Jira tabs and main `newWorktree:create` validation.

## ANTI-PATTERNS

- Do not return raw values from IPC handlers when `IpcOut` expects `Result`.
- Do not invent a different success/error envelope in main or renderer.
- Do not add non-serializable fields to `PaneNode`.
- Do not duplicate pane tree mutation logic in components; prefer shared pure helpers.
- Do not change persisted contracts without considering old SQLite rows.
