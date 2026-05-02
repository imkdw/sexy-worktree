# Rail Selection Mode Design

## Goal

Add an explicit Rail-owned multi-select mode for bulk force deletion of worktrees, while preserving all existing Rail behavior outside that mode.

## Current State

The app already has selection state and a force-delete confirmation flow:

- `src/renderer/state/selectMode.tsx` stores `selected` worktree ids and range-selection anchor state.
- `src/renderer/chrome/Rail.tsx` currently renders checkbox controls for every non-main worktree even when the user has not entered a selection mode.
- `src/renderer/chrome/Toolbar.tsx` shows selected count and force-delete controls whenever any worktree is selected.
- `src/renderer/selectMode/ConfirmDeleteModal.tsx` deletes selected non-main worktrees through the existing force-delete IPC path.

The problem is interaction scope: selection controls are always present, so Rail behaves like a multi-select list instead of a normal navigation rail with an explicit destructive workflow.

## Chosen Interaction Model

Rail owns selection mode entry and selection controls.

In normal mode:

- Rail rows keep their current behavior: clicking a row activates that worktree.
- No checkbox controls are shown.
- No bulk-delete controls are shown.
- Toolbar mode, new-worktree, and settings controls remain unchanged.

In selection mode:

- Rail shows a selection header.
- Non-main worktree rows show checkbox controls.
- The main/root worktree is never selectable and is never included in bulk selection.
- Clicking a selectable Rail row toggles selection instead of activating the worktree.
- Shift-click keeps the existing range-select behavior across selectable non-main worktrees.
- `Esc` exits selection mode and clears selection, unless an open dialog handles `Esc` first.
- `Cancel` exits selection mode and clears selection.
- Deletion completion exits selection mode and clears selection.

## Rail Header

Normal mode header:

```text
[ Select ]
```

Selection mode header:

```text
[ All/Clear ] [ N selected ] [ Cancel ]
```

`All/Clear` is a toggle:

- If no selectable worktrees exist, the control is disabled.
- If at least one selectable worktree is unselected, it selects all selectable non-main worktrees.
- If all selectable worktrees are already selected, it clears the current selection.

The count only includes selected non-main worktrees. If stale selected ids exist, the rendered count ignores them.

## Toolbar Role

The Toolbar is secondary in this design. It should not be the entry point for selection mode.

In normal mode, Toolbar keeps its existing layout.

In selection mode, Toolbar may show the selected count and a `Force Delete` action. `Force Delete` is disabled when zero selectable worktrees are selected and enabled when one or more selectable worktrees are selected.

## State Model

`selectMode.tsx` should become a real mode store, not just a selection store.

Required state and actions:

- `enabled: boolean`
- `selected: Set<string>`
- `lastToggledId: string | null`
- `enter(): void`
- `exit(): void`
- `toggle(id: string): void`
- `toggleRangeTo(target: string, allIds: string[]): void`
- `clearSelected(): void`
- `selectAll(ids: string[]): void`
- `toggleAll(ids: string[]): void`

State rules:

- Initial state is `enabled=false`, empty `selected`, and `lastToggledId=null`.
- `enter()` sets `enabled=true` and keeps selection empty.
- `exit()` sets `enabled=false`, clears `selected`, and clears `lastToggledId`.
- `clearSelected()` clears only selection and anchor state, leaving `enabled` unchanged.
- `selectAll(ids)` replaces selection with exactly the ids passed by the caller.
- `toggleAll(ids)` selects all ids when any id is missing, and clears selection when every id is already selected.
- Callers must pass only selectable non-main ids to `selectAll` and `toggleAll`.

## Accessibility And Design Rules

- Use `lucide-react` icons only.
- Do not use emoji or Unicode visual symbols.
- Use existing design tokens and Tailwind token utilities.
- Keep Rail row height at 32px and spacing aligned to `DESIGN.md`.
- Selection controls must have accessible names.
- Checkbox semantics are only present in selection mode.

## Testing Requirements

Unit tests must cover:

- `selectMode` initial state, `enter`, `exit`, `clearSelected`, `selectAll`, and `toggleAll`.
- Existing toggle and range behavior still works.
- `toggleAll` uses only ids provided by callers, so main/root exclusion is enforced by Rail's selectable id list.

Manual app verification with `playwright-electron` must cover:

- Normal Rail row click still activates a worktree.
- Rail `Select` enters selection mode.
- Selection mode checkboxes appear only for non-main rows.
- `All` selects every non-main worktree and does not select main/root.
- `Clear` clears selected worktrees without leaving selection mode.
- `Cancel` and `Esc` exit selection mode.
- `Force Delete` opens the existing confirmation modal with only selected non-main targets.
- Successful deletion exits selection mode.
