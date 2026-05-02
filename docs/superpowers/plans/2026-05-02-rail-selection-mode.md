# Rail Selection Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Rail-owned multi-select mode with non-main-only select-all and existing force-delete confirmation.

**Architecture:** Extend the existing `selectMode` provider into a real mode state machine, then make `Rail` switch between navigation behavior and selection behavior based on that state. Keep the existing deletion IPC and confirmation modal, and limit Toolbar changes to secondary selected-count and force-delete action display.

**Tech Stack:** Electron, React 19, TypeScript, Vitest jsdom tests, Tailwind v4 tokens, lucide-react icons, playwright-electron MCP for final UI verification.

---

## File Structure

- Modify: `src/renderer/state/selectMode.tsx`
  - Owns selection mode state and selection operations.
- Modify: `test/renderer/state/selectMode.test.ts`
  - Covers state transitions and bulk selection behavior.
- Modify: `src/renderer/chrome/Rail.tsx`
  - Adds Rail-owned selection header and mode-dependent row behavior.
- Modify: `src/renderer/chrome/Toolbar.tsx`
  - Shows selected count and force-delete action only while selection mode is enabled.
- Modify: `src/renderer/App.tsx`
  - Exits selection mode on repo switch, delete completion, and `Esc`.
- Modify: `src/renderer/selectMode/ConfirmDeleteModal.tsx`
  - Adds empty-target guarding and uses `exit()` after successful deletion.

## Task 1: Extend Select Mode State

**Files:**

- Modify: `src/renderer/state/selectMode.tsx`
- Test: `test/renderer/state/selectMode.test.ts`

- [ ] **Step 1: Update the state type tests first**

Edit `test/renderer/state/selectMode.test.ts` so the initial-state test expects `enabled=false`:

```ts
it("초기 상태는 선택 모드가 꺼져 있고 selected 비어있고 lastToggledId는 null", () => {
  active = mountHook();
  expect(active.hook.current.enabled).toBe(false);
  expect(active.hook.current.selected.size).toBe(0);
  expect(active.hook.current.lastToggledId).toBeNull();
});
```

Add these tests after the existing initial-state test:

```ts
it("enter는 선택 모드를 켜고 기존 선택 상태는 변경하지 않음", () => {
  active = mountHook();
  act(() => active!.hook.current.toggle("a"));
  act(() => active!.hook.current.enter());
  expect(active.hook.current.enabled).toBe(true);
  expect(active.hook.current.selected.has("a")).toBe(true);
});

it("exit는 선택 모드를 끄고 selected와 lastToggledId를 모두 리셋", () => {
  active = mountHook();
  act(() => active!.hook.current.enter());
  act(() => active!.hook.current.toggle("a"));
  act(() => active!.hook.current.exit());
  expect(active.hook.current.enabled).toBe(false);
  expect(active.hook.current.selected.size).toBe(0);
  expect(active.hook.current.lastToggledId).toBeNull();
});

it("clearSelected는 선택 모드는 유지하고 selected와 lastToggledId만 리셋", () => {
  active = mountHook();
  act(() => active!.hook.current.enter());
  act(() => active!.hook.current.toggle("a"));
  act(() => active!.hook.current.clearSelected());
  expect(active.hook.current.enabled).toBe(true);
  expect(active.hook.current.selected.size).toBe(0);
  expect(active.hook.current.lastToggledId).toBeNull();
});

it("selectAll은 전달받은 id 목록으로 selected를 교체하고 anchor를 마지막 id로 설정", () => {
  active = mountHook();
  act(() => active!.hook.current.toggle("stale"));
  act(() => active!.hook.current.selectAll(["a", "b"]));
  expect([...active.hook.current.selected]).toEqual(["a", "b"]);
  expect(active.hook.current.lastToggledId).toBe("b");
});

it("toggleAll은 일부만 선택된 경우 전달받은 모든 id를 선택", () => {
  active = mountHook();
  act(() => active!.hook.current.toggle("a"));
  act(() => active!.hook.current.toggleAll(["a", "b", "c"]));
  expect([...active.hook.current.selected]).toEqual(["a", "b", "c"]);
  expect(active.hook.current.lastToggledId).toBe("c");
});

it("toggleAll은 모두 선택된 경우 selected와 anchor를 리셋", () => {
  active = mountHook();
  act(() => active!.hook.current.selectAll(["a", "b"]));
  act(() => active!.hook.current.toggleAll(["a", "b"]));
  expect(active.hook.current.selected.size).toBe(0);
  expect(active.hook.current.lastToggledId).toBeNull();
});

it("toggleAll은 빈 목록이면 selected와 anchor를 리셋", () => {
  active = mountHook();
  act(() => active!.hook.current.toggle("a"));
  act(() => active!.hook.current.toggleAll([]));
  expect(active.hook.current.selected.size).toBe(0);
  expect(active.hook.current.lastToggledId).toBeNull();
});
```

- [ ] **Step 2: Run the select mode tests and verify they fail**

Run:

```bash
pnpm vitest run test/renderer/state/selectMode.test.ts
```

Expected: TypeScript or runtime failures because `enabled`, `enter`, `exit`, `clearSelected`, `selectAll`, and `toggleAll` are not implemented.

- [ ] **Step 3: Implement the state API**

Replace the `State` type and provider body in `src/renderer/state/selectMode.tsx` with this structure:

```ts
type State = {
  enabled: boolean;
  selected: Set<string>;
  lastToggledId: string | null;
  enter: () => void;
  exit: () => void;
  toggle: (id: string) => void;
  toggleRangeTo: (target: string, allIds: string[]) => void;
  clearSelected: () => void;
  selectAll: (ids: string[]) => void;
  toggleAll: (ids: string[]) => void;
};
```

Inside `SelectModeProvider`, add `enabled` state and these callbacks:

```ts
const [enabled, setEnabled] = useState(false);

const enter = useCallback(() => {
  setEnabled(true);
}, []);

const exit = useCallback(() => {
  setEnabled(false);
  setSelected(new Set());
  setLastToggledId(null);
}, []);

const clearSelected = useCallback(() => {
  setSelected(new Set());
  setLastToggledId(null);
}, []);

const selectAll = useCallback((ids: string[]) => {
  setSelected(new Set(ids));
  setLastToggledId(ids.at(-1) ?? null);
}, []);

const toggleAll = useCallback((ids: string[]) => {
  if (ids.length === 0) {
    setSelected(new Set());
    setLastToggledId(null);
    return;
  }

  setSelected((current) => {
    const allSelected = ids.every((id) => current.has(id));
    if (allSelected) {
      setLastToggledId(null);
      return new Set();
    }
    setLastToggledId(ids.at(-1) ?? null);
    return new Set(ids);
  });
}, []);
```

Return all fields from the provider:

```tsx
<Ctx.Provider
  value={{
    enabled,
    selected,
    lastToggledId,
    enter,
    exit,
    toggle,
    toggleRangeTo,
    clearSelected,
    selectAll,
    toggleAll,
  }}
>
  {children}
</Ctx.Provider>
```

- [ ] **Step 4: Run the select mode tests and verify they pass**

Run:

```bash
pnpm vitest run test/renderer/state/selectMode.test.ts
```

Expected: PASS.

## Task 2: Add Rail-Owned Selection Controls

**Files:**

- Modify: `src/renderer/chrome/Rail.tsx`

- [ ] **Step 1: Update imports**

Change the lucide import to include selection icons:

```ts
import { Check, CheckSquare, ChevronLeft, ChevronRight, Square, X } from "lucide-react";
```

- [ ] **Step 2: Add computed selection values**

After `selectableIds`, add:

```ts
const selectedCount = selectableIds.filter((id) => sm.selected.has(id)).length;
const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
```

- [ ] **Step 3: Add Rail selection header helpers**

Add these handlers before `return`:

```ts
function enterSelectionMode(): void {
  if (collapsed) toggleCollapsed();
  sm.enter();
}

function toggleAllSelectable(): void {
  sm.toggleAll(selectableIds);
}
```

- [ ] **Step 4: Add the Rail header above the scroll area**

Insert this block as the first child inside `<aside>` before the scroll container:

```tsx
<div className="border-border-subtle border-b p-2">
  {sm.enabled ? (
    <div className="flex items-center gap-2">
      <Tooltip label={allSelected ? "Clear selection" : "Select all worktrees"}>
        <button
          aria-label={allSelected ? "Clear selected worktrees" : "Select all worktrees"}
          className="text-text-muted hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150"
          disabled={selectableIds.length === 0}
          onClick={toggleAllSelectable}
        >
          <Icon icon={allSelected ? CheckSquare : Square} size={14} />
        </button>
      </Tooltip>
      {!collapsed && (
        <span className="text-text-secondary min-w-0 flex-1 truncate text-xs">
          {selectedCount} selected
        </span>
      )}
      <Tooltip label="Cancel selection">
        <button
          aria-label="Cancel selection mode"
          className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150"
          onClick={() => sm.exit()}
        >
          <Icon icon={X} size={14} />
        </button>
      </Tooltip>
    </div>
  ) : (
    <Tooltip label="Select worktrees">
      <button
        aria-label="Enter worktree selection mode"
        className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-full items-center justify-center gap-2 rounded-sm transition-colors duration-150"
        onClick={enterSelectionMode}
      >
        <Icon icon={Square} size={14} />
        {!collapsed && <span className="text-xs">Select</span>}
      </button>
    </Tooltip>
  )}
</div>
```

- [ ] **Step 5: Replace row click behavior with mode-aware behavior**

Replace the row `onClick={() => setActive(id)}` with:

```tsx
onClick={(e) => {
  if (!sm.enabled) {
    setActive(id);
    return;
  }
  if (wt.isMain) return;
  if (e.shiftKey) sm.toggleRangeTo(id, selectableIds);
  else sm.toggle(id);
}}
```

- [ ] **Step 6: Render checkboxes only in selection mode**

Replace the current checkbox rendering condition with:

```ts
const showCheckbox = sm.enabled && !collapsed && !wt.isMain;
const showSelectionPlaceholder = sm.enabled && !collapsed && wt.isMain;
```

Then update the row prefix rendering to:

```tsx
{!collapsed &&
  (showCheckbox ? (
    <span
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`Select ${wt.branch ?? wt.path}`}
      tabIndex={0}
      onClick={(e) => handleCheckboxClick(e, id)}
      onKeyDown={(e) => handleCheckboxKey(e, id)}
      className={cn(
        "border-border-strong inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150",
        isSelected && "border-accent bg-accent text-background"
      )}
    >
      {isSelected && <Icon icon={Check} size={10} />}
    </span>
  ) : showSelectionPlaceholder ? (
    <span className="inline-block h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
  ) : null)}
```

- [ ] **Step 7: Disable main row selection styling in selection mode**

Change the row class expression so main rows in selection mode are not shown as selectable:

```tsx
className={cn(
  "text-text-secondary hover:bg-surface flex h-8 items-center gap-3 overflow-hidden px-3 text-sm text-ellipsis whitespace-nowrap transition-colors duration-150",
  sm.enabled && wt.isMain ? "cursor-not-allowed opacity-60" : "cursor-pointer",
  active && "text-text-primary"
)}
```

## Task 3: Make Toolbar Selection UI Secondary

**Files:**

- Modify: `src/renderer/chrome/Toolbar.tsx`

- [ ] **Step 1: Gate selected count on selection mode**

Replace `selectableCount > 0 && (` with:

```tsx
{sm.enabled && (
```

- [ ] **Step 2: Use `exit()` for clear/cancel**

Change the clear button handler:

```tsx
onClick={() => sm.exit()}
```

Change the clear tooltip and aria label to communicate mode exit:

```tsx
<Tooltip label="Cancel selection (Esc)">
```

```tsx
aria-label="Cancel selection mode"
```

- [ ] **Step 3: Disable Force Delete when nothing is selected**

Add `disabled={selectableCount === 0}` to the Force Delete button and update its class:

```tsx
className={cn(
  "bg-destructive text-background inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
)}
disabled={selectableCount === 0}
```

Expected behavior: Toolbar shows selection status only in selection mode. The destructive action is unavailable until at least one non-main worktree is selected.

## Task 4: Update App Cleanup Flow

**Files:**

- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Exit selection mode on repo switch**

Replace the active repo effect body:

```ts
sm.exit();
```

Keep the dependency comment if needed to avoid a broad effect dependency loop.

- [ ] **Step 2: Exit selection mode on Escape**

Change the key handler condition:

```ts
if (e.key !== "Escape" || !sm.enabled) return;
```

Change the action:

```ts
sm.exit();
```

Expected behavior: `Esc` exits selection mode even when zero worktrees are selected. Open Radix dialogs still receive `Esc` first because the existing dialog guard remains.

## Task 5: Harden Confirm Delete Modal

**Files:**

- Modify: `src/renderer/selectMode/ConfirmDeleteModal.tsx`

- [ ] **Step 1: Use `exit()` after successful deletion**

Replace:

```ts
sm.clear();
```

with:

```ts
sm.exit();
```

- [ ] **Step 2: Guard empty targets**

At the start of `confirm()`, add:

```ts
if (targets.length === 0) return;
```

Disable the confirm button when `targets.length === 0`:

```tsx
disabled={targets.length === 0}
className="bg-destructive text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
```

Expected behavior: the modal cannot perform an empty delete and successful deletion exits the mode completely.

## Task 6: Verification

**Files:**

- No source edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run test/renderer/state/selectMode.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Launch the app for manual verification**

Run:

```bash
pnpm dev
```

Then use the `playwright-electron` MCP, as required by project instructions, to verify:

- Normal mode Rail row clicks still activate worktrees.
- Rail `Select` enters selection mode.
- Main/root row is not selectable.
- `All` selects every non-main worktree and does not select main/root.
- `Clear` clears selected worktrees while staying in selection mode.
- `Cancel` exits selection mode.
- `Esc` exits selection mode when no dialog is open.
- `Force Delete` is disabled with zero selected worktrees.
- `Force Delete` opens the existing confirmation modal with selected non-main targets.
- Successful delete exits selection mode.

## Self-Review

- Spec coverage: The plan covers explicit Rail-owned mode entry, normal-mode behavior preservation, non-main-only select-all, row click behavior split by mode, Toolbar as secondary UI, delete modal reuse, and required app verification.
- Placeholder scan: No `TBD`, deferred error handling, or unspecified test steps remain.
- Type consistency: The plan uses one `selectMode` API shape throughout: `enabled`, `enter`, `exit`, `clearSelected`, `selectAll`, and `toggleAll`.
