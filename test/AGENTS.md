# TEST KNOWLEDGE

## OVERVIEW

Vitest tests are centered under `test/` and mirror source layers. The suite mixes pure unit tests, main-process integration-ish tests with real temp repos/SQLite, and renderer jsdom tests with manual React mounting.

## STRUCTURE

```text
test/
|-- main/      # git, db, config, jira, pty, secrets, worktree
|-- renderer/  # card, chrome, lib, newWorktree, settings, shortcuts, state
`-- shared/    # pure shared contracts and helpers
```

## WHERE TO LOOK

| Task              | Location                                                                                                                                 | Notes                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Test config       | `vitest.config.ts`                                                                                                                       | `include: test/**/*.test.{ts,tsx}`, default node env |
| Main behavior     | `test/main/**`                                                                                                                           | Real temp repos, in-memory SQLite, fake dependencies |
| Renderer behavior | `test/renderer/**`                                                                                                                       | jsdom pragma and manual DOM interactions             |
| Shared logic      | `test/shared/**`                                                                                                                         | Pure functions and contracts                         |
| Large hotspots    | `test/renderer/settings/Settings.test.tsx`, `test/renderer/newWorktree/NewWorktreeModal.test.ts`, `test/main/worktree/bootstrap.test.ts` | Preserve coverage intent when editing                |

## CONVENTIONS

- Test files use `*.test.ts` or `*.test.tsx`.
- Vitest globals are disabled; import `describe`, `it`, `expect`, `vi`, hooks explicitly from `vitest`.
- Use aliases `@main`, `@renderer`, and `@shared`.
- Renderer DOM tests opt into jsdom per file with `// @vitest-environment jsdom`.
- Renderer tests use low-level `createRoot`, `createElement`, and `act`; no React Testing Library pattern exists.
- Complex renderer tests build a full `window.api` mock typed as `typeof window.api`.
- If a renderer module reads globals at import time, set mocks first, then use dynamic `import(...)` after `vi.resetModules()`.
- Main git/worktree tests create real temp repos using `mkdtempSync(join(tmpdir(), "sw-*"))` and inline git user config.
- DB tests use `new Database(":memory:")` and `runMigrations(db)`.
- Jira/network tests stub `globalThis.fetch`; secrets tests inject fake safeStorage.

## COMMANDS

```bash
pnpm test
pnpm vitest run test/renderer/settings/Settings.test.tsx
pnpm vitest run test/main/worktree/bootstrap.test.ts
```

## ANTI-PATTERNS

- Do not place new runnable tests under `src/**/__tests__` unless `vitest.config.ts` is intentionally changed; default `pnpm test` will not pick them up.
- Do not change global git config in tests; use inline `git -c user.email=... -c user.name=...`.
- Do not rely on `vitest run` alone when native rebuild state matters; `pnpm test` wraps rebuilds around Vitest.
- Do not add shared test utilities prematurely; current convention keeps helpers local to test files.
