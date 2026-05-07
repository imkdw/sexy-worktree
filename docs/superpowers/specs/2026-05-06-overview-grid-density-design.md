# Overview Grid Density Design

## Goal

Add an overview-only layout density control to the main page so users can switch the worktree terminal grid between the current 2x2 layout and a denser 3x3 layout.

The control is meant for repositories with many worktrees, such as `/Users/imkdw/ppl-monorepo`, where seeing more terminals at once matters more than giving each card maximum height.

## Current State

- `src/renderer/state/mode.tsx` owns the top-level app mode as `overview | focus`.
- `src/renderer/chrome/Toolbar.tsx` renders the right-side overview/focus toggle group plus New Worktree and Settings actions.
- `src/renderer/grid/Grid.tsx` hard-codes the overview layout as `grid-cols-2`.
- `src/renderer/index.css` defines `grid-card-rows`, which sets each grid row to half of the available app height.
- Terminal panes and xterm instances are owned by `TerminalSessionsProvider`; card rendering should not take over terminal lifecycle.
- Repo and pane layout state already use SQLite in the Electron main process.
- Rail width is stored in `localStorage`, but this new preference is repository-specific and should follow repo lifecycle.

## Chosen Model

Use a repository-specific SQLite preference for overview grid density.

`mode.tsx` remains focused on the top-level screen mode only:

- `overview`
- `focus`

The new density state is separate:

- `2x2`
- `3x3`

The density applies only when the app is in overview mode. Focus mode is unchanged.

## User Experience

In overview mode, the toolbar shows one density toggle button immediately after the existing overview/focus toggle group and before the New Worktree button.

The button is hidden in focus mode.

The button displays the current density as an icon:

- `Grid2x2` when the current overview density is `2x2`
- `Grid3x3` when the current overview density is `3x3`

The tooltip describes the action, not just the current state:

- Current `2x2`: `Switch to 3x3`
- Current `3x3`: `Switch to 2x2`

Clicking the button toggles the active repository's overview density. The selected value is remembered per repository and restored when returning to that repository.

## Layout Behavior

For `2x2` density:

- Overview grid uses 2 columns.
- Grid row height remains half of the available app content height.
- This preserves the current behavior.

For `3x3` density:

- Overview grid uses 3 columns.
- Grid row height becomes one third of the available app content height.
- Additional worktrees continue into the existing scrollable main area.

The layout change should be CSS-driven. It must not reset pane trees, recreate terminal session state unnecessarily, or move terminal lifecycle ownership out of `TerminalSessionsProvider`.

## Architecture

Add a small renderer state provider for overview grid density, separate from `ModeProvider`.

Expected shape:

- The provider watches `activeRepoId`.
- On active repo change, it loads the repo's density preference through IPC.
- Missing preference defaults to `2x2`.
- It exposes the current `density`, `setDensity`, and `toggleDensity`.
- Toggle uses optimistic UI update, then persists through IPC.
- On persistence failure, the provider restores the previous density and shows a toast.

The provider must be placed where `Shell` and `Grid` can read it, while still having access to the active repo from `ReposProvider`.

## Persistence

Store the preference in the main process SQLite database, not in `.sexyworktree/config.json` and not in `localStorage`.

Add a migration for a repo UI preferences table. The table should associate a repo id with its overview density and update timestamp.

Expected data model:

- `repo_id`: primary key and foreign key to `repos(id)`
- `overview_grid_density`: text value constrained to `2x2` or `3x3`
- `updated_at`: timestamp in milliseconds

The foreign key should cascade on repo deletion so closing a repository cleans up its preference.

Invalid or missing persisted values should be treated as `2x2`.

## IPC Contract

Add typed IPC channels for loading and saving overview density.

Expected operations:

- Load density by `repoId`
- Save density by `repoId`

The renderer must continue to access persistence only through typed `window.api` exposed from preload. Renderer components must not call Node, Electron, or SQLite APIs directly.

## Component Changes

`Shell` reads the density provider and passes `overviewGridDensity` plus `onToggleOverviewGridDensity` into `Toolbar`. This keeps `Toolbar` presentational, matching its current `mode` and `onModeChange` props.

`Toolbar` renders the density button only when `mode === "overview"`. The density button should follow existing toolbar icon-button styling:

- 32px square hit target
- `Tooltip`
- `Icon` wrapper
- semantic token classes only
- no custom SVG, emoji, unicode visual symbol, hex color, gradient, or decorative accent

`Grid` reads the density provider directly and chooses:

- `grid-cols-2` with `grid-card-rows-2`
- `grid-cols-3` with `grid-card-rows-3`

Replace the current generic `grid-card-rows` utility with explicit `grid-card-rows-2` and `grid-card-rows-3` utilities so the layout classes are easy to read and test.

## Error Handling

Loading failure:

- Fall back to `2x2`.
- Do not block rendering the overview grid.

Save failure:

- Revert to the previous density.
- Show a short error toast.

Invalid persisted value:

- Treat as `2x2`.
- Keep the UI stable.

No active repository:

- No density button is shown because the main empty state is not an overview grid.

Focus mode:

- The density button is hidden.
- The stored density is retained and applied the next time overview is shown.

## Testing

Main process tests:

- Migration creates the repo UI preferences table.
- Save then load returns the stored density.
- Missing preference returns `2x2`.
- Invalid persisted value falls back to `2x2`.
- Closing or deleting a repo removes its preference through the foreign key.

Renderer tests:

- Toolbar shows the density button in overview mode.
- Toolbar hides the density button in focus mode.
- Toolbar invokes the density toggle callback when clicked.
- Grid uses 2-column and 2-row classes for `2x2`.
- Grid uses 3-column and 3-row classes for `3x3`.
- Provider loads density on active repo change and falls back to `2x2`.
- Provider reverts and emits a toast on save failure.

Verification commands after implementation:

```bash
pnpm typecheck
pnpm vitest run test/main test/renderer/chrome/Toolbar.test.tsx test/renderer
pnpm test
```

The exact test command may be narrowed during implementation to the files actually touched, but typecheck and relevant Vitest coverage are required.

## Non-Goals

- No 4x4 or custom column count.
- No focus mode layout change.
- No keyboard shortcut for density switching.
- No settings modal surface for this preference.
- No storage in `.sexyworktree/config.json`.
- No changes to terminal pane split behavior.
- No direct xterm lifecycle changes.

## Open Decisions Resolved

- Density is overview-only, not a new top-level app mode.
- The toolbar uses one toggle button, not a two-button segmented control.
- The button is hidden in focus mode.
- The preference is stored per repository.
- The preference is stored in SQLite.
- The toolbar placement is immediately after the overview/focus toggle group.
