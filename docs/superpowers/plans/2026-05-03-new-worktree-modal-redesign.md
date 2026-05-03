# New Worktree Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the New Worktree modal into a compact method-card workflow with an always-visible create summary while preserving the existing direct, Jira, preflight, validation, and create behavior.

**Architecture:** Keep `NewWorktreeModal` as the renderer orchestration component and keep all IPC calls on the existing `config:get`, `jira:resolve`, `secrets:get`, `repo:list`, and `newWorktree:create` surface. Replace the tab list with a stateless `WorktreeMethodSelector`, add a stateless `WorktreeCreateSummary`, lift only branch preview and create-enabled state needed by the shared footer/summary, and leave `DirectTab`/`JiraTab` as method panels instead of renaming them.

**Tech Stack:** Electron 41, React 19, TypeScript 6, Radix Dialog, Tailwind v4 design tokens, lucide-react icons, Vitest/jsdom, existing manual React DOM test helpers.

---

## Scope

This plan covers only the New Worktree modal renderer redesign described in `docs/superpowers/specs/2026-05-03-new-worktree-modal-design.md`.

It preserves:

- Direct branch creation through `api.newWorktree.create({ repoId, branch })`.
- Jira ticket resolution through `api.jira.resolve({ repoId, ticketInput })`.
- Jira preflight through existing config and secret checks.
- Existing branch validation through `validateBranchName`.
- Existing inline create error mapping through `createErrorMessage`.
- Existing Radix Dialog wrapper, focus trap, close behavior, and no new IPC contracts.

It does not:

- Add renderer filesystem validation for target paths.
- Change main-process worktree creation semantics.
- Add Jira settings behavior.
- Add new design tokens.
- Rename every `DirectTab` or `JiraTab` reference.
- Create commits. This repository forbids commits unless the user explicitly asks.

## Current Code Map

- `src/renderer/newWorktree/NewWorktreeModal.tsx`
  - Owns open/close, active repo lookup, selected tab, busy state, config preflight for `branchValidation.requireJiraPattern`, direct submit error, Jira submit error, and create submission.
  - Currently imports `Dialog, Tabs` and renders `<Tabs.Root>`, `<Tabs.List>`, and two `<Tabs.Content>` panels.
- `src/renderer/newWorktree/DirectTab.tsx`
  - Owns direct branch input state and validation.
  - Currently renders its own `Cancel` and `Create` footer.
- `src/renderer/newWorktree/JiraTab.tsx`
  - Owns Jira preflight, ticket input, resolve state, branch preview editing, resolve errors, and branch preview validation.
  - Currently renders its own `JiraActions` footer in all states.
- `src/renderer/newWorktree/PreflightNotice.tsx`
  - Existing Jira setup notice and Settings action.
- `src/renderer/ui/Dialog.tsx`
  - Existing Radix Dialog wrapper. Use `Dialog.Content size="normal"` for this modal.
- `src/shared/branchValidation.ts`
  - Existing `validateBranchName(name, { requireJiraPattern })` helper.
- `test/renderer/newWorktree/NewWorktreeModal.test.ts`
  - Existing jsdom tests and local helpers: `makeApi`, `flush`, `setInput`, `clickButton`, `clickButtonByLabel`, `waitForInput`, `waitForText`, `mountModal`.

## File Structure

- Create `src/renderer/newWorktree/WorktreeMethodSelector.tsx`
  - Stateless two-card method selector.
  - Uses real buttons with accessible names `Direct` and `From Jira` and `aria-pressed` selected state.
- Create `src/renderer/newWorktree/WorktreeCreateSummary.tsx`
  - Stateless quiet summary panel for base branch, worktree directory, and target path preview.
  - Does not call IPC.
- Modify `src/renderer/newWorktree/DirectTab.tsx`
  - Keep local direct branch input and validation.
  - Remove the old generic hint and old footer actions.
  - Report branch preview and create-enabled state to `NewWorktreeModal`.
  - Expose submit through the parent shared footer by accepting an optional `onRequestSubmit` registration callback.
- Modify `src/renderer/newWorktree/JiraTab.tsx`
  - Remove `JiraActions` and old footer actions.
  - Keep ticket, resolve, preflight, branch preview editing, resolve errors, and inline create errors.
  - Report branch preview and create-enabled state to `NewWorktreeModal`.
  - Expose submit through the parent shared footer by accepting an optional `onRequestSubmit` registration callback.
- Modify `src/renderer/newWorktree/NewWorktreeModal.tsx`
  - Replace Radix tabs with `WorktreeMethodSelector` and conditional method panels.
  - Load full repo config on open, not just `requireJiraPattern`.
  - Render a shared footer with `Cancel` and `Create Worktree`.
  - Render `WorktreeCreateSummary` below the method panel in all method states.
- Modify `test/renderer/newWorktree/NewWorktreeModal.test.ts`
  - Update old `Create` button expectations to `Create Worktree`.
  - Add method-card accessibility and summary tests.
  - Preserve and extend direct/Jira behavior tests.

## Task 1: Add Method Selector And Summary Tests

**Files:**

- Modify: `test/renderer/newWorktree/NewWorktreeModal.test.ts`

- [ ] **Step 1: Update the button click helper to disambiguate submit buttons**

In `test/renderer/newWorktree/NewWorktreeModal.test.ts`, replace `clickButton` with this exact implementation so tests can click either the new footer CTA or method-card buttons by exact text:

```ts
async function clickButton(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label
  );
  if (!button) throw new Error(`button not found: ${label}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
```

Expected: no behavior change yet; this keeps the existing helper because the new plan still uses exact visible button text.

- [ ] **Step 2: Rename existing create button references**

In the same test file, replace user-facing create button text in existing tests:

```ts
expect(document.body.textContent).toContain("Create Worktree");
expect(document.body.textContent).not.toContain("Confirm");

await setInput("#direct-branch", "feat-add-search");
await clickButton("Create Worktree");
```

Apply the same exact `clickButton("Create Worktree")` replacement everywhere the test currently clicks `Create` for worktree creation. Keep `clickButton("Resolve")`, `clickButton("Direct")`, `clickButton("From Jira")`, and `clickButton("Cancel")` unchanged.

Expected: tests fail until the shared footer button is renamed from `Create` to `Create Worktree`.

- [ ] **Step 3: Add the method card accessibility test**

Add this test after `shows compact direct actions and closes after create is accepted`:

```ts
it("renders method cards with selected state instead of document tabs", async () => {
  const api = makeApi();
  const mounted = await mountModal(api);
  cleanup = mounted.unmount;

  const direct = [...document.querySelectorAll("button")].find(
    (el): el is HTMLButtonElement => el.textContent?.includes("Direct") ?? false
  );
  const jira = [...document.querySelectorAll("button")].find(
    (el): el is HTMLButtonElement => el.textContent?.includes("From Jira") ?? false
  );

  expect(direct).toBeTruthy();
  expect(jira).toBeTruthy();
  expect(direct?.getAttribute("aria-pressed")).toBe("true");
  expect(jira?.getAttribute("aria-pressed")).toBe("false");
  expect(document.querySelector('[role="tablist"]')).toBeNull();

  await clickButton("From Jira");

  expect(direct?.getAttribute("aria-pressed")).toBe("false");
  expect(jira?.getAttribute("aria-pressed")).toBe("true");
});
```

Expected: fail because the modal still renders Radix tabs and no `aria-pressed` method cards.

- [ ] **Step 4: Add the direct summary test**

Add this test after the method-card test:

```ts
it("shows create summary and updates target path from Direct branch input", async () => {
  const api = makeApi();
  const mounted = await mountModal(api);
  cleanup = mounted.unmount;

  expect(document.body.textContent).toContain("Base branch");
  expect(document.body.textContent).toContain("main");
  expect(document.body.textContent).toContain("Worktree directory");
  expect(document.body.textContent).toContain("../worktrees");
  expect(document.body.textContent).not.toContain("../worktrees/feat-add-search");

  await setInput("#direct-branch", "feat-add-search");
  await flush();

  expect(document.body.textContent).toContain("Target path");
  expect(document.body.textContent).toContain("../worktrees/feat-add-search");
});
```

Expected: fail because `WorktreeCreateSummary` does not exist yet.

- [ ] **Step 5: Add the Jira summary update test**

Add this test after the direct summary test:

```ts
it("updates the summary target path from Jira resolved and edited branch previews", async () => {
  const api = makeApi({
    config: {
      get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    secrets: {
      get: vi.fn().mockResolvedValue(ok({ value: "token" })),
      set: vi.fn(),
      remove: vi.fn(),
    },
    jira: {
      resolve: vi.fn().mockResolvedValue(
        ok({
          ticketKey: "PROJ-123",
          summary: "Add search",
          suggestedBranch: "PROJ-123-feat-add-search",
        })
      ),
    },
  });
  const mounted = await mountModal(api);
  cleanup = mounted.unmount;

  await clickButton("From Jira");
  await waitForInput("#jira-ticket");
  await setInput("#jira-ticket", "PROJ-123");
  await clickButton("Resolve");
  await flush();

  expect(document.body.textContent).toContain("../worktrees/PROJ-123-feat-add-search");

  await clickButtonByLabel("Edit branch name");
  await setInput("#jira-branch", "PROJ-123-feat-add-search-v2");
  await flush();

  expect(document.body.textContent).toContain("../worktrees/PROJ-123-feat-add-search-v2");
});
```

Expected: fail because Jira branch preview is not lifted into the summary yet.

- [ ] **Step 6: Run the focused modal tests and verify they fail**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: fail on the new method card and summary expectations, and fail on renamed `Create Worktree` expectations until implementation updates the modal.

## Task 2: Create Stateless Method Selector

**Files:**

- Create: `src/renderer/newWorktree/WorktreeMethodSelector.tsx`
- Modify: `src/renderer/newWorktree/NewWorktreeModal.tsx`
- Test: `test/renderer/newWorktree/NewWorktreeModal.test.ts`

- [ ] **Step 1: Create the method selector component**

Create `src/renderer/newWorktree/WorktreeMethodSelector.tsx`:

```tsx
import { GitBranch, Ticket, type LucideIcon } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";

export type WorktreeMethod = "direct" | "jira";

type Method = {
  value: WorktreeMethod;
  title: string;
  description: string;
  icon: LucideIcon;
};

const METHODS: Method[] = [
  {
    value: "direct",
    title: "Direct",
    description: "Type an exact branch name.",
    icon: GitBranch,
  },
  {
    value: "jira",
    title: "From Jira",
    description: "Resolve a ticket into a branch.",
    icon: Ticket,
  },
];

type Props = {
  value: WorktreeMethod;
  onChange: (value: WorktreeMethod) => void;
  disabled?: boolean;
};

export function WorktreeMethodSelector({
  value,
  onChange,
  disabled = false,
}: Props): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Worktree creation method">
      {METHODS.map((method) => {
        const selected = method.value === value;
        return (
          <button
            key={method.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(method.value)}
            className={cn(
              "border-border-subtle text-text-secondary hover:bg-elevated hover:text-text-primary focus:outline-accent-soft flex flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors duration-150 focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40",
              selected &&
                "border-accent bg-elevated text-text-primary outline-accent-soft outline-2"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon icon={method.icon} size={14} />
              {method.title}
            </span>
            <span className="text-text-muted text-xs">{method.description}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Replace tab imports in the modal**

In `src/renderer/newWorktree/NewWorktreeModal.tsx`, replace this import:

```tsx
import { Dialog, Tabs } from "../ui";
```

with:

```tsx
import { Dialog } from "../ui";
import { WorktreeMethodSelector, type WorktreeMethod } from "./WorktreeMethodSelector";
```

Then replace the existing tab state:

```tsx
const [tab, setTab] = useState<"jira" | "direct">("direct");
```

with:

```tsx
const [method, setMethod] = useState<WorktreeMethod>("direct");
```

- [ ] **Step 3: Replace the tab rendering with method cards**

In `NewWorktreeModal`, replace the entire `<Tabs.Root>...</Tabs.Root>` block with this temporary method-panel rendering. This step only changes selection semantics; the old per-panel footers still exist until Task 4.

```tsx
<div className="flex flex-col gap-4">
  <Dialog.Header>
    <div className="flex min-w-0 flex-col gap-1">
      <Dialog.Title>New Worktree</Dialog.Title>
      <Dialog.Description>Choose how to name the branch, then create.</Dialog.Description>
    </div>
    <Dialog.Close disabled={busy} />
  </Dialog.Header>

  <WorktreeMethodSelector value={method} onChange={setMethod} disabled={busy} />

  {method === "direct" ? (
    <DirectTab
      requireJiraPattern={requireJira}
      busy={busy}
      submitError={directSubmitError}
      onSubmit={submitDirect}
      onCancel={onClose}
    />
  ) : (
    <JiraTab
      busy={busy}
      requireJiraPattern={requireJira}
      submitError={jiraSubmitError}
      onSubmit={submitJira}
      onCancel={onClose}
      onClearSubmitError={() => setJiraSubmitError(null)}
      onOpenSettings={() => {
        onClose();
        window.dispatchEvent(new CustomEvent("app:open-settings"));
      }}
    />
  )}
</div>
```

- [ ] **Step 4: Run the focused modal tests**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: the method-card test now passes its `aria-pressed` and no-tablist assertions. Tests that expect `Create Worktree` and summary content still fail.

## Task 3: Add Config-Backed Create Summary

**Files:**

- Create: `src/renderer/newWorktree/WorktreeCreateSummary.tsx`
- Modify: `src/renderer/newWorktree/DirectTab.tsx`
- Modify: `src/renderer/newWorktree/JiraTab.tsx`
- Modify: `src/renderer/newWorktree/NewWorktreeModal.tsx`
- Test: `test/renderer/newWorktree/NewWorktreeModal.test.ts`

- [ ] **Step 1: Create the summary component**

Create `src/renderer/newWorktree/WorktreeCreateSummary.tsx`:

```tsx
import type { RepoConfigDto } from "@shared/ipc";

type Props = {
  config: RepoConfigDto | null;
  branchPreview: string;
};

function targetPath(baseDir: string, branch: string): string {
  if (!branch) return "";
  const trimmedBase = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
  return `${trimmedBase}/${branch}`;
}

function SummaryRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-secondary min-w-0 truncate">{value}</dd>
    </div>
  );
}

export function WorktreeCreateSummary({ config, branchPreview }: Props): React.JSX.Element {
  const baseBranch = config?.worktree.defaultBaseBranch ?? "Loading";
  const baseDir = config?.worktree.baseDir ?? "Loading";
  const preview =
    config && branchPreview ? targetPath(config.worktree.baseDir, branchPreview) : "Not selected";

  return (
    <section
      aria-label="Create summary"
      className="border-border-subtle rounded-md border p-3 text-xs"
    >
      <dl className="flex flex-col gap-2">
        <SummaryRow label="Base branch" value={baseBranch} />
        <SummaryRow label="Worktree directory" value={baseDir} />
        <SummaryRow label="Target path" value={preview} />
      </dl>
    </section>
  );
}
```

- [ ] **Step 2: Add branch preview callbacks to DirectTab props**

In `src/renderer/newWorktree/DirectTab.tsx`, replace the `Props` type with:

```tsx
type Props = {
  requireJiraPattern: boolean;
  busy: boolean;
  submitError: string | null;
  onSubmit: (branch: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void;
  onBranchPreviewChange?: (branch: string) => void;
  onCanCreateChange?: (canCreate: boolean) => void;
  onRequestSubmitChange?: (submit: (() => void) | null) => void;
};
```

Update the import to include `useEffect`:

```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 3: Report direct branch preview and create state**

Inside `DirectTab`, after `const v = validateBranchName(branch, { requireJiraPattern });`, add:

```tsx
useEffect(() => {
  onBranchPreviewChange?.(branch);
}, [branch, onBranchPreviewChange]);

useEffect(() => {
  onCanCreateChange?.(v.ok && !busy);
}, [busy, onCanCreateChange, v.ok]);

useEffect(() => {
  if (!v.ok || busy) {
    onRequestSubmitChange?.(null);
    return;
  }
  onRequestSubmitChange?.(() => {
    void onSubmit(branch);
  });
  return () => onRequestSubmitChange?.(null);
}, [branch, busy, onRequestSubmitChange, onSubmit, v.ok]);
```

- [ ] **Step 4: Remove the direct generic hint**

Delete this block from `DirectTab`:

```tsx
<span className="text-text-muted text-xs">Creates in the configured worktree directory.</span>
```

Do not remove direct inline validation or create errors.

- [ ] **Step 5: Add branch preview callbacks to JiraTab props**

In `src/renderer/newWorktree/JiraTab.tsx`, replace the `Props` type with:

```tsx
type Props = {
  busy: boolean;
  requireJiraPattern: boolean;
  submitError: string | null;
  onSubmit: (branch: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void;
  onClearSubmitError: () => void;
  onOpenSettings: () => void;
  onBranchPreviewChange?: (branch: string) => void;
  onCanCreateChange?: (canCreate: boolean) => void;
  onRequestSubmitChange?: (submit: (() => void) | null) => void;
};
```

- [ ] **Step 6: Report Jira branch preview and create state**

In `JiraTab`, after:

```tsx
const branchValue = editingBranch ? draftBranch : (resolved?.branch ?? "");
const branchValid = validateBranchName(branchValue, { requireJiraPattern });
```

add:

```tsx
const canCreate = !!resolved && branchValid.ok && !busy;

useEffect(() => {
  onBranchPreviewChange?.(branchValue);
}, [branchValue, onBranchPreviewChange]);

useEffect(() => {
  onCanCreateChange?.(canCreate);
}, [canCreate, onCanCreateChange]);

useEffect(() => {
  if (!canCreate) {
    onRequestSubmitChange?.(null);
    return;
  }
  onRequestSubmitChange?.(() => {
    void onSubmit(branchValue);
  });
  return () => onRequestSubmitChange?.(null);
}, [branchValue, canCreate, onRequestSubmitChange, onSubmit]);
```

Keep the existing `branchValid` inline error.

- [ ] **Step 7: Load full config in NewWorktreeModal**

In `src/renderer/newWorktree/NewWorktreeModal.tsx`, add this import:

```tsx
import type { RepoConfigDto } from "@shared/ipc";
import { WorktreeCreateSummary } from "./WorktreeCreateSummary";
```

Add these state values after existing error state:

```tsx
const [repoConfig, setRepoConfig] = useState<RepoConfigDto | null>(null);
const [branchPreview, setBranchPreview] = useState("");
const [canCreate, setCanCreate] = useState(false);
const [requestSubmit, setRequestSubmit] = useState<(() => void) | null>(null);
```

Replace the existing config-loading effect body with:

```tsx
useEffect(() => {
  if (!open || !repo) return;
  setDirectSubmitError(null);
  setJiraSubmitError(null);
  setBranchPreview("");
  setCanCreate(false);
  setRequestSubmit(null);
  void (async () => {
    const r = await api.config.get({ repoPath: repo.path });
    if (!r.ok) return;
    setRepoConfig(r.value.config);
    setRequireJira(r.value.config.branchValidation?.requireJiraPattern ?? false);
  })();
}, [open, repo]);
```

- [ ] **Step 8: Reset method-local parent state when switching methods**

In `NewWorktreeModal`, add:

```tsx
function changeMethod(nextMethod: WorktreeMethod): void {
  setMethod(nextMethod);
  setBranchPreview("");
  setCanCreate(false);
  setRequestSubmit(null);
}
```

Then render the selector as:

```tsx
<WorktreeMethodSelector value={method} onChange={changeMethod} disabled={busy} />
```

- [ ] **Step 9: Pass callbacks and render summary**

In the `DirectTab` render, add these props:

```tsx
onBranchPreviewChange={setBranchPreview}
onCanCreateChange={setCanCreate}
onRequestSubmitChange={(submit) => setRequestSubmit(submit ? () => submit : null)}
```

In the `JiraTab` render, add the same props:

```tsx
onBranchPreviewChange={setBranchPreview}
onCanCreateChange={setCanCreate}
onRequestSubmitChange={(submit) => setRequestSubmit(submit ? () => submit : null)}
```

Render summary directly below the conditional method panel:

```tsx
<WorktreeCreateSummary config={repoConfig} branchPreview={branchPreview} />
```

The shared footer is added in Task 4, so `canCreate` and `requestSubmit` can remain unused until then. If TypeScript flags unused values before Task 4, continue immediately to Task 4 before running `pnpm typecheck`.

- [ ] **Step 10: Run the focused modal tests**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: direct and Jira summary tests pass. `Create Worktree` expectations still fail until the footer is shared and renamed in Task 4.

## Task 4: Move Create Actions To Shared Footer

**Files:**

- Modify: `src/renderer/newWorktree/DirectTab.tsx`
- Modify: `src/renderer/newWorktree/JiraTab.tsx`
- Modify: `src/renderer/newWorktree/NewWorktreeModal.tsx`
- Test: `test/renderer/newWorktree/NewWorktreeModal.test.ts`

- [ ] **Step 1: Remove footer actions from DirectTab**

In `DirectTab`, remove `onCancel` from destructuring:

```tsx
export function DirectTab({
  requireJiraPattern,
  busy,
  submitError,
  onSubmit,
  onBranchPreviewChange,
  onCanCreateChange,
  onRequestSubmitChange,
}: Props): React.JSX.Element {
```

Then remove the entire footer block:

```tsx
<div className="flex items-center justify-end gap-3">
  <button
    type="button"
    className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
    onClick={onCancel}
    disabled={busy}
  >
    Cancel
  </button>
  <button
    type="submit"
    className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
    disabled={!v.ok || busy}
  >
    {busy ? "Creating..." : "Create"}
  </button>
</div>
```

Keep the `<form>` wrapper and `onSubmit` handler so pressing Enter in the direct input still submits when valid.

- [ ] **Step 2: Remove JiraActions from JiraTab**

In `JiraTab`, delete the entire `JiraActions` helper function.

In the preflight state, replace the return value with:

```tsx
return (
  <div className="flex flex-col gap-4">
    <PreflightNotice onOpenSettings={onOpenSettings} />
  </div>
);
```

In the loading state, replace the return value with:

```tsx
return (
  <div className="flex flex-col gap-4">
    <div className="text-text-muted">Loading...</div>
  </div>
);
```

At the bottom of the normal Jira state, remove this block:

```tsx
<JiraActions
  busy={busy}
  canCreate={!!resolved && branchValid.ok}
  onCancel={onCancel}
  onCreate={() => (resolved && branchValid.ok ? void onSubmit(branchValue) : undefined)}
/>
```

- [ ] **Step 3: Remove unused onCancel props from panel types**

In `DirectTab` and `JiraTab`, remove `onCancel` from the `Props` type.

In `NewWorktreeModal`, remove `onCancel={onClose}` from both `DirectTab` and `JiraTab` calls.

- [ ] **Step 4: Add the shared modal footer**

In `NewWorktreeModal`, render this footer after `WorktreeCreateSummary`:

```tsx
<Dialog.Footer>
  <button
    type="button"
    className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
    onClick={onClose}
    disabled={busy}
  >
    Cancel
  </button>
  <button
    type="button"
    className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
    disabled={!canCreate || busy || requestSubmit === null}
    onClick={() => requestSubmit?.()}
  >
    {busy ? "Creating..." : "Create Worktree"}
  </button>
</Dialog.Footer>
```

This shared footer must remain below the summary so Direct, Jira preflight, Jira loading, and Jira resolved states all share the same create rhythm.

- [ ] **Step 5: Keep preflight create disabled**

Verify that the Jira preflight path calls the parent callbacks through the default reset state:

```tsx
setCanCreate(false);
setRequestSubmit(null);
```

These resets already happen when switching methods in `changeMethod`. Do not add a second create action inside `JiraTab`.

- [ ] **Step 6: Run the focused modal tests**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: existing direct create, create rejection, preflight, Jira create failure, stale Jira error, method-card, and summary tests pass.

## Task 5: Tighten Error Clearing And Inline Validation Coverage

**Files:**

- Modify: `test/renderer/newWorktree/NewWorktreeModal.test.ts`
- Modify: `src/renderer/newWorktree/DirectTab.tsx`
- Modify: `src/renderer/newWorktree/JiraTab.tsx`

- [ ] **Step 1: Add a direct invalid branch test**

Add this test after the direct create success test:

```ts
it("disables direct create and shows inline validation for an invalid direct branch", async () => {
  const api = makeApi();
  const mounted = await mountModal(api);
  cleanup = mounted.unmount;

  await setInput("#direct-branch", "feat add search");
  await flush();

  const createButton = [...document.querySelectorAll("button")].find(
    (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
  );

  expect(createButton?.disabled).toBe(true);
  expect(document.body.textContent).toContain("Branch name cannot contain spaces.");
  expect(api.newWorktree.create).not.toHaveBeenCalled();
});
```

Expected: pass if `DirectTab` still uses the existing `REASON_TEXT` mapping and shared footer consumes `canCreate`.

- [ ] **Step 2: Add a Jira resolve success create-enabled test**

Add this test after `keeps Jira preflight inside the shared cancel/create rhythm`:

```ts
it("enables Jira create after resolve succeeds with a valid branch preview", async () => {
  const api = makeApi({
    config: {
      get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    secrets: {
      get: vi.fn().mockResolvedValue(ok({ value: "token" })),
      set: vi.fn(),
      remove: vi.fn(),
    },
    jira: {
      resolve: vi.fn().mockResolvedValue(
        ok({
          ticketKey: "PROJ-123",
          summary: "Add search",
          suggestedBranch: "PROJ-123-feat-add-search",
        })
      ),
    },
  });
  const mounted = await mountModal(api);
  cleanup = mounted.unmount;

  await clickButton("From Jira");
  await waitForInput("#jira-ticket");

  let createButton = [...document.querySelectorAll("button")].find(
    (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
  );
  expect(createButton?.disabled).toBe(true);

  await setInput("#jira-ticket", "PROJ-123");
  await clickButton("Resolve");
  await flush();

  createButton = [...document.querySelectorAll("button")].find(
    (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
  );
  expect(document.querySelector<HTMLInputElement>("#jira-branch")?.value).toBe(
    "PROJ-123-feat-add-search"
  );
  expect(createButton?.disabled).toBe(false);
});
```

Expected: pass after Task 4.

- [ ] **Step 3: Confirm stale Jira create errors still clear**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts -t "clears stale Jira create errors"
```

Expected: pass. The existing test must still verify errors clear when branch preview or ticket input changes.

- [ ] **Step 4: Run the full focused modal test file**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: all tests in the file pass.

## Task 6: Design-System And Verification Pass

**Files:**

- Review: `src/renderer/newWorktree/WorktreeMethodSelector.tsx`
- Review: `src/renderer/newWorktree/WorktreeCreateSummary.tsx`
- Review: `src/renderer/newWorktree/NewWorktreeModal.tsx`
- Review: `src/renderer/newWorktree/DirectTab.tsx`
- Review: `src/renderer/newWorktree/JiraTab.tsx`
- Review: `test/renderer/newWorktree/NewWorktreeModal.test.ts`

- [ ] **Step 1: Search for forbidden visual patterns in changed renderer code**

Run:

```bash
rg -n "#[0-9a-fA-F]{3,8}|text-\\[|p-\\[|m-\\[|gap-\\[|rounded-\\[|shadow|gradient|glow|emoji|\\x{2713}|\\x{2717}|\\x{2192}|\\x{2190}|14px" src/renderer/newWorktree test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: no matches. If a match appears in changed code, replace it with existing design tokens, lucide icons, or scale utilities from `DESIGN.md`.

- [ ] **Step 2: Run formatter check on changed source**

Run:

```bash
pnpm format:check
```

Expected: pass. If formatting fails, run `pnpm format` and re-run `pnpm format:check`.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: pass. If lint reports pre-existing unrelated files, record those exact file paths and messages before continuing; fix only issues introduced by these new-worktree changes.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass. Note that the local LSP server may be unavailable because `typescript-language-server` is not installed; `pnpm typecheck` is the authoritative TypeScript verification.

- [ ] **Step 5: Run the focused renderer test file**

Run:

```bash
pnpm vitest run test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: all NewWorktreeModal tests pass.

- [ ] **Step 6: Run the full test suite if native rebuilds are available**

Run:

```bash
pnpm test
```

Expected: pass. If native rebuilds for `better-sqlite3` or `node-pty` fail because the local environment is missing toolchain support, record the failure and keep the focused renderer test, lint, and typecheck results as the minimum local verification.

- [ ] **Step 7: Manual Electron verification**

Run:

```bash
pnpm dev
```

Then use `playwright-electron` or manual app interaction to verify:

1. Open the app from the main repository, not a worktree path.
2. Open `New Worktree` from the toolbar or `Cmd+N`.
3. Switch between `Direct` and `From Jira` using pointer.
4. Use keyboard focus to tab through `Direct`, `From Jira`, `Branch Name`, `Cancel`, and `Create Worktree`; selected method cards expose selected state and focus uses the existing accent-soft outline.
5. Type `feat-add-search` in Direct and confirm the summary shows `../worktrees/feat-add-search`.
6. Type `feat add search` in Direct and confirm inline validation disables `Create Worktree`.
7. Open `From Jira` with Jira disabled or token missing and confirm the setup notice, Settings button, summary, and disabled shared `Create Worktree` button all remain visible.
8. If Jira config and token are available, resolve a ticket, edit the branch preview, confirm the summary updates, and create the worktree.
9. Confirm no browser console errors or warnings are introduced.

Expected: all paths that the local environment can satisfy pass. If Electron or Jira cannot be launched/configured locally, report the untested path explicitly.

## Self-Review

- Spec coverage: Covered method cards, header description, Direct branch input, Jira preflight, Jira resolve/preview/edit, always-visible summary, shared footer, inline errors, no new IPC, accessibility, design-token constraints, and renderer/manual verification.
- Placeholder scan: No placeholder red-flag terms or unspecified test-writing steps are present.
- Type consistency: The method type is consistently `WorktreeMethod = "direct" | "jira"`; branch preview callbacks are consistently named `onBranchPreviewChange`, `onCanCreateChange`, and `onRequestSubmitChange`; `onRequestSubmitChange` receives the actual submit function and `NewWorktreeModal` wraps it before storing it in React state; the shared footer consumes `canCreate` and `requestSubmit` from `NewWorktreeModal`.
- Project rule check: No step instructs creating a branch or commit because the repository explicitly forbids commits unless the user asks.
