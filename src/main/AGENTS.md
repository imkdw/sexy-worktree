# MAIN PROCESS KNOWLEDGE

## OVERVIEW

Electron main owns privileged work: BrowserWindow lifecycle, IPC handlers, SQLite, git/worktree commands, PTY lifecycle, repo config, secrets, Jira, and Claude Code CLI branch slugs.

## STRUCTURE

```text
src/main/
|-- index.ts       # app lifecycle, DB-before-IPC init, PTY/DB cleanup
|-- ipc/           # renderer-accessible handlers
|-- db/            # better-sqlite3 singleton, migrations, repos, panes, recents
|-- git/           # git subprocess wrappers, repo validation, worktree listing/removal
|-- worktree/      # new-worktree job state machine and step execution
|-- config/        # .sexyworktree/config.json schema/load/save/defaults
|-- pty/           # node-pty manager
|-- jira/          # direct Atlassian REST and ticket parsing
|-- secrets/       # Keychain/safeStorage wrapper
`-- claude/        # Claude Code CLI slug generation
```

## WHERE TO LOOK

| Task                   | Location                                                                               | Notes                                                |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Add IPC                | `src/shared/ipc.ts`, `src/main/ipc/<domain>.ts`, `src/main/ipc/index.ts`               | Also update preload and renderer API                 |
| App lifecycle          | `src/main/index.ts`                                                                    | Keep DB initialization before registering IPC        |
| Worktree job behavior  | `worktree/bootstrap.ts`, `worktree/steps.ts`                                           | Preserve step snapshots, retries, conflict semantics |
| Git operations         | `git/exec.ts`, `git/worktrees.ts`, `git/validate.ts`, `git/removeWorktree.ts`          | Use real git tests for behavior                      |
| PTY behavior           | `pty/manager.ts`, `ipc/pty.ts`                                                         | cwd guard and listener cleanup are required          |
| Persistence            | `db/index.ts`, `db/migrations.ts`, domain files                                        | Append migrations; do not mutate old ones            |
| Repo config            | `config/schema.ts`, `config/load.ts`, `config/saveRepository.ts`, `config/saveJira.ts` | Missing config returns defaults                      |
| Jira branch suggestion | `jira/client.ts`, `jira/parseTicket.ts`, `claude/slug.ts`                              | REST first, Claude Code CLI for slug                 |

## CONVENTIONS

- IPC handlers use `IpcIn<"channel">`, return `Promise<IpcOut<"channel">>`, and wrap expected failures in `err(...)`.
- New handler modules expose `registerXHandlers()` and are wired only through `ipc/index.ts`.
- Long-running work returns a `jobId`; progress is pushed via events, not by blocking IPC.
- Production DB access goes through `getDb()` singleton; tests can create `new Database(":memory:")` and call `runMigrations(db)`.
- Git subprocesses go through `gitExec` unless a step intentionally shells out.
- Worktree creation order follows shared `ALL_STEPS`; failed and running jobs remain active conflicts.
- PTY spawn checks cwd existence and reports `cwd-missing`; `killAll()` runs before quit.

## ANTI-PATTERNS

- Do not add untyped IPC string literals without updating `src/shared/ipc.ts`.
- Do not throw expected domain failures across IPC; convert to Result error unions.
- Do not instantiate independent app DB connections in production paths.
- Do not edit existing migrations; append a new migration.
- Do not accept a git worktree path as the app's main repo.
- Do not show prunable/missing worktrees unless PTY cwd handling changes too.
- Do not collapse worktree bootstrap into one opaque command; UI depends on step status.
- Do not remove failed jobs from conflict tracking unless cancellation semantics change.
- Do not bypass Keychain for secrets or put Jira tokens in repo config.

## TESTS

- Main tests live in `test/main/**` and run in Vitest's default Node environment.
- Git/worktree tests create real temp repositories; keep inline git user config, never global config.
- DB tests use in-memory SQLite plus migrations.
- Bootstrapper tests use injected step runners for state-machine edge cases.
