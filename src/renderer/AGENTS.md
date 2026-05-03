# RENDERER KNOWLEDGE

## OVERVIEW

React renderer owns the UI shell, terminal grid/focus modes, xterm attachment, settings/new-worktree flows, toasts, shortcuts, and local UI state. `DESIGN.md` is mandatory before any visual change.

## STRUCTURE

```text
src/renderer/
|-- App.tsx          # provider tree and shell layout
|-- index.css        # Tailwind v4 @theme tokens and global utilities
|-- chrome/          # titlebar, tabs, toolbar, rail
|-- card/            # worktree card, pane tree, provisioning card
|-- state/           # React context providers
|-- terminal/        # xterm lifecycle helpers
|-- settings/        # repository/Jira settings modal
|-- newWorktree/     # direct/Jira worktree creation modal
|-- ui/              # Radix wrappers with project styling
|-- ipc/             # typed window.api access
`-- lib/             # cn/cssVar helpers
```

## WHERE TO LOOK

| Task                 | Location                                            | Notes                                                 |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Design rules         | `DESIGN.md`, `index.css`                            | Update both plus decision log for new tokens/patterns |
| Shell/provider order | `App.tsx`                                           | Provider hierarchy is behavioral                      |
| Chrome/rail/tabs     | `chrome/`                                           | Rail width uses localStorage and `--rail-w`           |
| Terminal card/panes  | `card/`, `terminal/`, `state/terminalSessions.tsx`  | xterm nodes survive remounts/splits                   |
| Settings             | `settings/Settings.tsx`, `settings/settingsForm.ts` | Biggest renderer hotspot                              |
| New worktree modal   | `newWorktree/`                                      | Direct and Jira tabs share create rhythm              |
| Shared primitives    | `ui/`                                               | Prefer wrappers over ad hoc Radix styling             |
| IPC calls            | `ipc/api.ts`                                        | Renderer uses typed `window.api` only                 |
| Renderer tests       | `test/renderer/**`                                  | New runnable tests normally go outside `src`          |

## CONVENTIONS

- Use semantic token utilities from `index.css`: `bg-background`, `bg-surface`, `text-text-muted`, `border-border-subtle`, etc.
- `--color-background` is intentional; do not introduce `--color-base` because Tailwind v4 collides with `text-base`.
- Use `cn()` for conditional classes and `cssVar()` when non-DOM libraries need token values.
- Icons go through lucide-react; `Icon.tsx` defines default size/stroke behavior.
- State uses colocated React Context providers; no Redux/Zustand pattern exists.
- `TerminalSessionsProvider` keeps terminal entries, pane trees, exits, timers, and loading sets in refs; state only bumps renders.
- Pane tree edits diff leaf IDs, spawn/dispose xterm entries, then debounce save via IPC after 250ms.

## ANTI-PATTERNS

- Do not touch UI without reading `DESIGN.md`.
- No hex colors in TS/TSX, arbitrary Tailwind values, emoji/Unicode symbols, sans-serif, 14px body text, light mode, gradients, glows, colored shadows, or decorative accent.
- Do not use `--color-accent` as generic hover; hover is usually surface/text strength.
- Chrome `overflow-*` containers need `scrollbar-hidden`; terminal scrollbars use hover-reveal.
- Do not bypass `ui/` wrappers for Radix primitives unless adding a new governed wrapper.
- Do not couple xterm/PTy lifetime to individual leaf component mounts.
- Do not add visible pane split controls unless `DESIGN.md` changes first.
- Do not call Node/Electron APIs directly from renderer components.

## TESTS

- Renderer DOM tests use `// @vitest-environment jsdom`.
- Tests manually mount with `createRoot`, `createElement`, and `act`; no Testing Library convention exists.
- Set `window.api` mocks before dynamic imports for modules that read the API at import time.
- `src/renderer/chrome/__tests__/useRailWidth.test.ts` exists but is outside the default Vitest include; prefer `test/renderer/...` for new tests unless config changes.
