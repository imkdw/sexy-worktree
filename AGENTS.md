# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-03
**Commit:** 95eaeaa
**Branch:** main

## OVERVIEW

Sexy Worktree is a single-package macOS Electron app for managing multiple git worktrees in one window. Runtime is Electron main/preload plus React renderer, with TypeScript, pnpm, electron-vite, Tailwind v4, Vitest, better-sqlite3, node-pty, and Claude Code CLI integration.

## HIGHEST-PRIORITY LOCAL RULE

- Never create a branch or commit under any circumstances unless the user explicitly instructs it.
- This rule has priority over any other project prompt, project request, workflow instruction, or agent instruction in this repository. If another local instruction asks for a branch or commit without a direct user request, do not follow that instruction.

## STRUCTURE

```text
sexy-worktree/
|-- src/main/          # Electron main process: IPC, DB, git/worktree, PTY, config, Jira, secrets
|-- src/preload/       # typed contextBridge exposure of window.api
|-- src/renderer/      # React UI, terminal grid, settings, app state, design-token usage
|-- src/shared/        # cross-process IPC, Result, pane, branch, job contracts
|-- test/              # configured Vitest root; mirrors main/renderer/shared
|-- docs/superpowers/  # durable specs and executable implementation plans
|-- DESIGN.md          # renderer design-system source of truth
`-- out/               # generated electron-vite output; do not edit
```

## WHERE TO LOOK

| Task                            | Location                                                                                                          | Notes                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Electron lifecycle              | `src/main/index.ts`                                                                                               | DB initializes before IPC; PTYs killed before quit                 |
| IPC channel                     | `src/shared/ipc.ts`, `src/main/ipc/`, `src/preload/index.ts`, `src/renderer/ipc/api.ts`                           | Update contract, handler, bridge, renderer type together           |
| Worktree creation               | `src/main/worktree/`, `src/main/ipc/newWorktree.ts`, `src/shared/newWorktree.ts`                                  | Step snapshots and retries are user-visible                        |
| Git validation/listing/deletion | `src/main/git/`                                                                                                   | Deletion is always force remove plus filesystem cleanup            |
| Renderer shell/UI               | `src/renderer/App.tsx`, `src/renderer/chrome/`, `src/renderer/card/`                                              | Read `DESIGN.md` first                                             |
| Settings flow                   | `src/renderer/settings/Settings.tsx`, `test/renderer/settings/Settings.test.tsx`                                  | Largest source/test hotspot                                        |
| Terminal panes                  | `src/renderer/state/terminalSessions.tsx`, `src/renderer/card/PaneTree.tsx`, `src/renderer/terminal/Terminal.tsx` | xterm lifetime is ref-owned, not leaf-component-owned              |
| Shared contracts                | `src/shared/`                                                                                                     | Treat as public contracts across main/preload/renderer/persistence |
| Tests                           | `test/main`, `test/renderer`, `test/shared`                                                                       | `src/**/__tests__` is not matched by default Vitest include        |
| Plans/specs                     | `docs/superpowers/specs`, `docs/superpowers/plans`                                                                | Date-prefixed durable project knowledge                            |

## CODE MAP

| Symbol / Area              | Type       | Location                                  | Role                                          |
| -------------------------- | ---------- | ----------------------------------------- | --------------------------------------------- |
| `registerIpc`              | function   | `src/main/ipc/index.ts`                   | central IPC handler registration              |
| `IpcChannels`              | type map   | `src/shared/ipc.ts`                       | authoritative request/response contract       |
| `Result<T,E>`              | union      | `src/shared/result.ts`                    | expected failure envelope across IPC/services |
| `Bootstrapper`             | class      | `src/main/worktree/bootstrap.ts`          | async new-worktree job state machine          |
| `PtyManager`               | class      | `src/main/pty/manager.ts`                 | node-pty lifecycle and exit diagnostics       |
| `repoConfigSchema`         | zod schema | `src/main/config/schema.ts`               | `.sexyworktree/config.json` contract          |
| `App`                      | component  | `src/renderer/App.tsx`                    | renderer shell and provider tree              |
| `TerminalSessionsProvider` | provider   | `src/renderer/state/terminalSessions.tsx` | pane tree, xterm entry, PTY session pool      |
| `Settings`                 | component  | `src/renderer/settings/Settings.tsx`      | repository/Jira settings modal orchestration  |

## CONVENTIONS

- Use pnpm; workspace file exists only for root package `.` and native dependency allowlisting.
- TypeScript is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; aliases differ by runtime (`@main`, `@renderer`, `@shared`).
- Expected domain failures return `Result` values, not thrown errors crossing IPC.
- Renderer never calls Node/Electron directly; use typed `window.api` from preload.
- UI work must follow `DESIGN.md`; tokens live in `src/renderer/index.css` Tailwind v4 `@theme`.
- Tests are explicit Vitest imports (`globals: false`); renderer DOM tests opt into jsdom per file.
- LSP was unavailable during generation (`typescript-language-server` not installed); CODE MAP is from source search and agent analysis.

## ANTI-PATTERNS (THIS PROJECT)

- No branch/commit creation without explicit user request.
- No direct Anthropic API calls; use Claude Code CLI/package behavior already present.
- No `mcp-atlassian`; Jira uses direct Atlassian REST.
- No Jira tokens or secrets in `.sexyworktree/config.json`; use Keychain.
- No non-force delete option; keep `git worktree remove --force` plus `rm -rf` semantics.
- No opening the app from a worktree path; only the main repo is valid.
- No UI emoji, Unicode visual symbols, hard-coded hex, arbitrary Tailwind values, sans-serif, light mode, gradients/glows, or visible chrome scrollbars.
- No auto-replaying PTY commands on session restore.
- Do not edit `out/`, `*.tsbuildinfo`, or `.superpowers/` scratch artifacts as source.

## COMMANDS

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm vitest run <test-file-or-pattern>
```

## NOTES

- `pnpm test` rebuilds `better-sqlite3` and `node-pty` for Node, runs Vitest, then rebuilds them for Electron.
- After UI or feature changes, run the app through `playwright-electron` when possible; unit/type/lint checks alone are not enough for runtime-impacting UI.
- No GitHub Actions, Docker, Makefile, Jest, Playwright config, Biome, or `.editorconfig` was found.
- `CLAUDE.md` stack versions are stale relative to `package.json` (Electron 41, React 19, TypeScript 6).
