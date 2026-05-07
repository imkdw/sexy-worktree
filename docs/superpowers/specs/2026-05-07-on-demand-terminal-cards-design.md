# On-Demand Terminal Cards Design

## Goal

Change terminal card creation from "every worktree always has a terminal card" to an on-demand model.

The app should keep the left rail as the complete worktree list, but only render terminal cards that the user has opened. This reduces terminal noise in repositories with many worktrees while keeping quick rail-based access to each worktree.

## Current State

- `src/renderer/state/worktrees.tsx` owns the active repository's worktree list and a single `activeId`.
- `src/renderer/grid/Grid.tsx` renders one `Card` for every worktree returned by `useWorktrees()`.
- `src/renderer/focus/Focus.tsx` renders the `Card` for `activeId`.
- `src/renderer/chrome/Rail.tsx` renders the same worktree list and updates `activeId` on normal row click.
- `src/renderer/state/terminalSessions.tsx` watches `worktreesByRepo`, loads or creates a pane tree for every discovered worktree, and spawns PTYs for every leaf in those trees.
- `Card` delegates pane tree and PTY ownership to `TerminalSessionsProvider`.
- `Card` currently treats the header `X` and `Cmd+W` as focused-pane close actions, but `closePaneImpl` refuses to close the final leaf.
- `pane:load` and `pane:save` IPC persist pane layout by `(repoId, worktreePath)`.

The result is that opening a repository with many worktrees creates many terminal cards and PTYs, even when the user only needs one or two active terminals.

## Chosen Model

Use a renderer-only open terminal card list owned by `TerminalSessionsProvider`.

`WorktreesProvider` remains the source of truth for real worktrees. It still powers the rail, deletion selection mode, worktree counts, and repository refresh behavior.

`TerminalSessionsProvider` becomes the source of truth for currently open terminal cards:

- A card key is `(repoId, worktreePath)`.
- A worktree can have at most one open terminal card at a time.
- Opening an already-open worktree focuses that existing card.
- Opening a closed worktree creates exactly one new leaf and spawns one PTY.
- Closing the last leaf removes the terminal card and kills its PTY.
- Opening that worktree again later starts with a fresh single terminal, not the old split layout.

No new main-process IPC or database migration is required for this model.

## User Experience

The rail remains the complete worktree launcher.

Normal rail click behavior:

1. If selection mode is off, set the clicked worktree as the active worktree.
2. If its terminal card is already open, focus that card.
3. If its terminal card is not open, create a new card with one terminal.

Selection mode behavior is unchanged. In selection mode, rail clicks select worktrees for deletion and do not open terminals.

Initial app and repository state:

- Opening a repository does not automatically open any terminal cards.
- Restarting the app does not restore previously open terminal cards.
- Newly created worktrees appear in the rail but do not automatically open a terminal card.
- The user opens a terminal by selecting the worktree in the rail.

Overview mode:

- Renders open terminal cards for the active repository.
- Does not render cards for closed worktrees.
- Continues to render provisioning cards for live new-worktree jobs.
- If the repository has worktrees but no open terminal cards and no live jobs, show a terminal-specific empty state with headline `No terminals open` and body `Select a worktree in the rail to open a terminal.`
- If the repository has no worktrees, keep the existing no-worktree empty state.

Focus mode:

- Keeps the current screen mode when the user clicks the rail.
- If the active worktree has an open terminal card, render that card full-size.
- If the active worktree has no open terminal card, show a terminal-specific empty state with headline `No terminal selected` and body `Select a worktree in the rail to open it here.`

Card close behavior:

- The header `X` and `Cmd+W` share the same rule.
- If the active card has multiple leaves, close only the focused leaf.
- If the active card has one leaf, close the whole terminal card and kill its PTY.
- When closing the active card and other cards remain in the active repository, focus a neighboring card.
- When no open cards remain, leave the rail selection as the last selected worktree and show the terminal empty state.

## State Model

Keep `WorktreesProvider.activeId` as the active worktree selection. It drives the rail active row, active card border, and focus-mode target.

Add open-card state inside `TerminalSessionsProvider`:

- `openCardsByRepo`: repository id to ordered worktree paths.
- `paneTreesRef`: only contains trees for open cards.
- `entriesRef`: only contains xterm and PTY entries for leaves of open cards.
- `exitInfoRef`: only contains exit state for leaves of open cards.
- Existing save timers and loading state should not create trees for unopened worktrees.

Expose a small terminal-card API:

- `openOrFocus(repoId, worktreePath)`: ensure a card exists for the worktree and make it active.
- `closeCard(repoId, worktreePath)`: dispose all leaf entries for the card and remove it from `openCardsByRepo`.
- `isOpen(repoId, worktreePath)`: return whether a card is open.
- `getOpenCards(repoId)`: return open card worktree paths in render order.
- Existing `getOps(repoId, worktreePath)` remains the card-level pane API.
- Scoped `WorktreeOps` gains `closeCurrent(focusedLeafId)`, which closes the focused leaf when multiple leaves exist and closes the whole card when only one leaf exists.

`activeCard` is derived from `activeId` plus the active repository's open cards. Do not introduce a second active terminal id for this feature.

## Lifecycle

Opening a card:

1. Validate that the worktree still exists in `worktreesByRepo`.
2. If the card is already in `openCardsByRepo`, call `setActive(worktreePath)` and return.
3. Append the worktree path to the repo's open-card order.
4. Create `newLeaf(newLeafId())`.
5. Set that tree through the existing tree diff helper so one `LeafEntry` and one PTY are created.
6. Call `setActive(worktreePath)`.

Closing a focused pane:

1. Resolve the active card's current tree.
2. If the tree has more than one leaf, use the existing `closeLeaf` flow and dispose only the removed leaf.
3. If the tree has one leaf, call `closeCard`.

Closing a card:

1. Dispose every `LeafEntry` in the card tree, including PTYs and xterm instances.
2. Delete the card's pane tree and exit info.
3. Remove the worktree path from `openCardsByRepo`.
4. If the closed card was active and another open card remains in the active repo, set active worktree to the nearest remaining card in the previous order.
5. If no open cards remain, keep the last rail selection and render the terminal empty state.

Repository and worktree cleanup:

- When a repository is closed, dispose all open terminal cards for that repo.
- When a worktree disappears from a repository refresh or delete job, dispose its terminal card if it is open.
- Closed worktrees should not have pane trees, PTYs, save timers, or xterm instances.

## Pane Layout Persistence

The new user-facing behavior does not restore pane layout when opening a terminal card.

`openOrFocus` should create a fresh single leaf for a closed worktree even if an old pane layout exists in SQLite. This directly supports the chosen rule that closed terminals reopen as a single new terminal.

The existing `pane:load` and `pane:save` IPC contracts can remain in place for compatibility and future restore behavior, but this feature must not depend on them for opening terminal cards. Active split, resize, and last-command updates may continue to call `pane:save` to minimize churn in existing code, but those saved layouts must not be loaded when reopening a closed card.

No SQLite migration is needed.

## Component Changes

`TerminalSessionsProvider`

- Stop auto-loading or auto-spawning pane trees for every worktree in `worktreesByRepo`.
- Add open-card state and operations.
- Continue owning xterm, PTY, pane trees, exits, restart, split, resize, command tracking, and disposal.
- Keep tree diffing as the central place that spawns and disposes leaf entries.

`Rail`

- On normal row click, call `openOrFocus(activeRepoId, worktreePath)`.
- In selection mode, keep existing selection behavior and do not open terminals.
- Keep current visual treatment for active rail rows.

`Grid`

- Render `Card` components from open cards for the active repository, not from every worktree.
- Resolve branch labels from the current worktree list.
- Continue rendering live provisioning cards.
- Show a terminal empty state when worktrees exist but no terminal cards are open.

`Focus`

- Render the active worktree's open card when it exists.
- Show a terminal empty state when the active worktree has no open card.
- Keep current mode behavior. Rail clicks do not force mode changes.

`Card`

- Use scoped `WorktreeOps.closeCurrent(focusedLeafId)` for the header `X` and `Cmd+W` close path.
- Multiple leaves close the focused pane.
- One leaf closes the terminal card.

`KeyboardShortcuts`

- `Cmd+W` continues to dispatch the close action to the active card.
- Previous and next worktree shortcuts should mirror normal worktree selection: select the target worktree and open or focus its terminal card.
- Split and pane-focus shortcuts only affect an open active card.

## Error Handling

Worktree no longer exists:

- If the user clicks a stale rail row during a refresh race, `openOrFocus` must no-op rather than creating a PTY for a missing path.
- If PTY spawn fails because the cwd is missing, keep the existing spawn-failed view for open cards.

No active repository:

- Rail and grid behavior should remain disabled or empty through existing app shell conditions.

Repository switch:

- Open cards are stored per repo.
- Switching tabs changes which repo's open cards are rendered.
- Open cards for repositories that remain open may continue to exist until the repo is closed or their worktrees disappear.

Live jobs:

- Provisioning cards remain visible in overview while jobs are queued, running, or failed.
- A completed worktree appears in the rail after refresh but does not auto-open a terminal.

Close races:

- If a PTY exits while the card is being closed, disposal should be idempotent and must not leave stale exit info.
- If a card is closed while a save timer exists, clear that timer.

## Testing

Renderer state tests:

- `openOrFocus` opens a closed worktree with one new leaf.
- `openOrFocus` on an already-open worktree does not create a duplicate card.
- Closing a card disposes all leaf entries and removes the worktree from open cards.
- Removing a worktree from `worktreesByRepo` disposes its open terminal card.
- Opening a repository or discovering worktrees does not auto-create pane trees or PTYs.

Renderer component tests:

- `Grid` renders only open terminal cards, not every worktree.
- `Grid` shows the terminal empty state when worktrees exist but no terminal cards are open.
- `Grid` still renders live provisioning cards.
- `Focus` renders the active open card.
- `Focus` shows a terminal empty state when the active worktree has no open card.
- `Rail` normal click opens or focuses a terminal card.
- `Rail` selection-mode click does not open a terminal card.
- `Card` closes the focused pane when multiple leaves exist.
- `Card` closes the whole terminal card when only one leaf exists.
- `KeyboardShortcuts` next and previous worktree actions open or focus the selected target.

Verification commands after implementation:

```bash
pnpm typecheck
pnpm vitest run test/renderer/grid/Grid.test.tsx test/renderer/card/Card.test.tsx test/renderer/chrome/Rail.test.tsx test/renderer/shortcuts/shortcutMap.test.ts
pnpm vitest run test/renderer
pnpm test
```

The exact focused command may be narrowed during implementation to the files actually touched, but typecheck and relevant renderer coverage are required.

After UI-impacting implementation, run the app through an Electron browser check when possible because terminal lifecycle and renderer state changes can pass unit tests while still failing in the real shell.

## Non-Goals

- No branch creation or git commit automation.
- No main-process IPC additions.
- No SQLite migration.
- No multiple simultaneous cards for the same worktree.
- No restore of closed terminal layouts.
- No automatic terminal opening on app startup.
- No automatic terminal opening after new-worktree completion.
- No mode change when clicking rail rows.
- No changes to worktree deletion semantics.
- No change to PTY spawn, write, resize, or kill IPC contracts.
- No visible pane split controls.

## Open Decisions Resolved

- Rail click uses focus-or-spawn.
- Reopening a closed terminal starts with a single fresh terminal.
- Initial app state opens no terminal cards.
- The header `X` and `Cmd+W` use the same close rule.
- Multiple panes close the focused pane.
- A single pane closes the whole terminal card.
- Rail click preserves the current overview or focus mode.
- Renderer open-card state is preferred over overloading `WorktreesProvider.activeId` or pane-tree null state.
