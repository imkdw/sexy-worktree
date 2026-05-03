# Background Worktree Delete Design

## Goal

Make bulk force deletion non-blocking from the user's point of view.

After the user confirms deletion, the confirmation dialog should close immediately and the user should be able to keep working in other worktrees. Deletion should continue in the background, with a visible per-worktree progress list that shows which items are pending, deleting, deleted, failed, or cancelled.

## Current State

`src/renderer/selectMode/ConfirmDeleteModal.tsx` currently owns the whole delete loop. It calls `api.worktree.remove(...)` once per selected worktree and awaits each call before closing the dialog. While this loop is running, the user stays trapped in the confirmation flow.

The main process already has a project convention for long-running work: return a `jobId` quickly and push progress through events. New worktree creation follows this model through `Bootstrapper`, `newWorktree:create`, `newWorktree:event`, and renderer job state in `NewWorktreeProvider`.

The delete flow should move to the same shape, but as a dedicated delete job queue rather than a broad generic background-job refactor.

## Chosen Approach

Add a dedicated main-process worktree delete job manager.

Renderer responsibilities:

- Start a delete job with one IPC call.
- Close the confirmation dialog immediately after a successful job start.
- Exit selection mode after a successful job start.
- Subscribe to delete job events.
- Render delete jobs in a right-side Background Jobs panel.
- Refresh the affected repo as individual worktrees are deleted.

Main process responsibilities:

- Validate the delete request before creating a job.
- Own delete job snapshots and event emission.
- Process target worktrees sequentially.
- Continue deleting remaining items when one item fails.
- Cancel only items that have not started yet.
- Preserve failed job details until the user dismisses them.

This keeps destructive filesystem and git work in the main process, matches the existing long-running IPC convention, and avoids a large refactor of the new-worktree provisioning system.

## Out Of Scope

- A generic background job framework for all job types.
- Retry actions for failed delete items.
- Re-selecting failed worktrees from the Background Jobs panel.
- Persisting delete jobs across app restarts.
- Parallel deletion. The first implementation should delete sequentially to keep git worktree state changes predictable.

## Shared Types

Add delete-job shared types in `src/shared/deleteWorktree.ts`.

```ts
export type DeleteWorktreeItemStatus =
  | "pending"
  | "deleting"
  | "deleted"
  | "failed"
  | "cancelled";

export type DeleteWorktreeJobStatus = "running" | "done" | "failed" | "cancelled";

export type DeleteWorktreeJobItem = {
  worktreePath: string;
  branch: string | null;
  status: DeleteWorktreeItemStatus;
  errorMessage: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

export type DeleteWorktreeJobSnapshot = {
  id: string;
  repoId: number;
  repoPath: string;
  status: DeleteWorktreeJobStatus;
  items: DeleteWorktreeJobItem[];
  cancelRequested: boolean;
  createdAt: number;
  finishedAt: number | null;
};

export type DeleteWorktreeJobEvent =
  | { kind: "created"; job: DeleteWorktreeJobSnapshot }
  | { kind: "updated"; job: DeleteWorktreeJobSnapshot }
  | { kind: "completed"; job: DeleteWorktreeJobSnapshot }
  | { kind: "dismissed"; jobId: string };
```

Job status rules:

- `running`: at least one item can still be processed and the job has not reached a terminal state.
- `done`: every item is `deleted`.
- `failed`: all processable items reached a terminal item state and at least one item is `failed`.
- `cancelled`: cancel was requested, no item failed, and at least one item is `cancelled`.

Item status rules:

- `pending`: the item has not started.
- `deleting`: `removeWorktree` is currently running for the item.
- `deleted`: `removeWorktree` finished successfully.
- `failed`: `removeWorktree` failed or threw for the item.
- `cancelled`: the item was still pending when cancel was applied.

## IPC Contract

Keep the existing `worktree:remove` IPC for compatibility, but stop using it from the bulk delete UI. Add new typed channels to `src/shared/ipc.ts`, preload, and renderer API wrappers.

```ts
"worktreeDelete:start": {
  in: {
    repoId: number;
    targets: { worktreePath: string; branch: string | null }[];
  };
  out: Result<{ jobId: string }, { message: string }>;
};

"worktreeDelete:cancel": {
  in: { jobId: string };
  out: Result<void, { message: string }>;
};

"worktreeDelete:dismiss": {
  in: { jobId: string };
  out: Result<void, { message: string }>;
};

"worktreeDelete:list": {
  in: { repoId: number };
  out: Result<{ jobs: DeleteWorktreeJobSnapshot[] }, never>;
};
```

Renderer event subscription:

```ts
worktreeDelete: {
  start: Invoker<"worktreeDelete:start">;
  cancel: Invoker<"worktreeDelete:cancel">;
  dismiss: Invoker<"worktreeDelete:dismiss">;
  list: Invoker<"worktreeDelete:list">;
  onEvent: (cb: (e: DeleteWorktreeJobEvent) => void) => () => void;
}
```

Main process should send events on `worktreeDelete:event`.

## Main Process Design

Add a manager under a main-owned delete module, for example `src/main/worktreeDelete/manager.ts`. The manager should be unit-testable with an injected remover function.

The manager owns:

- `snapshots: Map<string, DeleteWorktreeJobSnapshot>`
- `listeners: Set<EventListener>`
- `runningJobs: Set<string>`
- active conflict detection by repo id and worktree path

Public manager operations:

- `onEvent(fn)`: subscribe to job events.
- `list(repoId)`: list snapshots for one repo.
- `findActiveConflict({ repoId, worktreePaths })`: detect targets already included in running delete jobs.
- `enqueue(input)`: create a job snapshot, emit `created`, and start async processing.
- `cancel(jobId)`: request cancellation and mark pending items as `cancelled` when the current item boundary is reached.
- `dismiss(jobId)`: remove terminal jobs from snapshots and emit `dismissed`.

Delete processing should be sequential:

1. Mark the next pending item as `deleting`.
2. Emit `updated`.
3. Call `removeWorktree({ repoPath, worktreePath })`.
4. If it succeeds, mark the item `deleted`.
5. If it fails or throws, mark only that item `failed` with `errorMessage`.
6. Emit `updated`.
7. If cancel is requested, mark all remaining `pending` items `cancelled` and finish the job.
8. Otherwise continue to the next pending item.
9. Compute final job status and emit `completed`.

The handler for `worktreeDelete:start` should validate before enqueueing:

- `repoId` must resolve to an open repo.
- `targets` must not be empty.
- Every target path must currently appear in `listWorktrees(repo.path)`.
- No target may be the main worktree.
- No target may already be part of a running delete job for the same repo.

Validation failures return `Result.err({ message })` and do not create a job.

## Renderer State

Add `DeleteWorktreeProvider`, likely under `src/renderer/state/deleteWorktree.tsx`.

Provider responsibilities:

- Load current jobs for the active repo through `worktreeDelete:list`.
- Subscribe to `worktreeDelete:event`.
- Ignore events for other repos, except `dismissed` events where local state can remove by `jobId`.
- Merge `created`, `updated`, and `completed` snapshots by `job.id`.
- Remove snapshots on `dismissed`.
- Call `refreshRepo(repoId)` whenever a received snapshot contains an item that newly transitioned to `deleted`.
- Auto-dismiss fully successful jobs after a short delay, approximately 3 seconds.
- Keep failed or cancelled jobs visible until the user dismisses them.

The provider should expose enough state and actions for the panel:

```ts
type State = {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
};
```

`App.tsx` should include the provider near `NewWorktreeProvider` and render the Background Jobs panel inside the main shell.

## Confirmation Flow

`ConfirmDeleteModal` should become a start-job confirmation instead of the delete executor.

On confirm:

1. Build targets from the selected non-main worktrees.
2. If no targets exist, do nothing and keep the confirm button disabled.
3. Set local `starting` state while `worktreeDelete:start` is in flight.
4. On start failure, keep the dialog open and show an error toast.
5. On start success, close the dialog, call `sm.exit()`, and show the Background Jobs panel through provider state when the event/list response arrives.

The button label can use `Starting...` while the start IPC is in flight. It should not say `Deleting...` because deletion no longer happens inside the dialog.

## Background Jobs Panel

Add a right-side panel, for example `src/renderer/backgroundJobs/BackgroundJobsPanel.tsx`.

The panel should render only when there is at least one visible delete job. It should live inside the Shell next to the main grid/focus area:

```text
[Rail] [main Grid/Focus area] [Background Jobs panel]
```

The panel should follow `DESIGN.md`:

- Use `bg-surface` or `bg-background` layers and `border-border-subtle`.
- Use `scrollbar-hidden` for chrome scrolling.
- Use lucide icons only.
- Keep text compact with project typography tokens.
- Avoid gradients, glows, hard-coded colors, arbitrary Tailwind values, emoji, and Unicode status symbols.

Panel content:

- Header: `Background Jobs`
- Job title: `Deleting worktrees`
- Summary: completed count over total, with failed/cancelled counts when present.
- Item list with branch when available, otherwise path.
- Per-item status icon:
  - `pending`: `Circle`
  - `deleting`: `Loader2` with spin
  - `deleted`: `Check`
  - `failed`: `AlertCircle` or `XCircle`
  - `cancelled`: `X`
- Failed items show a compact error message.
- Running jobs show `Cancel Pending`.
- Failed or cancelled terminal jobs show `Dismiss`.
- Fully successful jobs should auto-dismiss and do not need a manual action.

`Cancel Pending` should call `worktreeDelete:cancel`. It must communicate the real policy: it cancels only items that have not started yet.

## Worktree List Refresh

Deleted worktrees should disappear from Rail/Grid as soon as each item reaches `deleted`.

Renderer refresh policy:

- On a newly observed `deleted` item, call `refreshRepo(job.repoId)`.
- Avoid refreshing repeatedly for the same item transition by comparing the previous local snapshot with the new snapshot.
- Active worktree fallback can rely on the existing `WorktreesProvider` behavior: when `activeId` no longer exists in the refreshed list, it chooses the first available worktree.

The implementation should verify whether terminal sessions for removed worktree cards are cleaned up when the card unmounts. If PTY sessions remain attached to deleted cwd entries, add a focused cleanup step in the implementation plan.

## Error Handling

Start errors are request-level errors. They prevent job creation and return `Result.err({ message })`.

Examples:

- Repo not found.
- Empty target list.
- Target path no longer exists in `git worktree list`.
- Target is the main worktree.
- Target is already included in another running delete job.

Item errors are job-level errors. They mark one item as `failed`, preserve an error message, and allow the job to continue with the remaining pending items.

Examples:

- `git worktree remove --force` failure.
- Filesystem cleanup failure from `rm`.
- Unexpected exception thrown by the remover.

Failed terminal jobs stay visible in the Background Jobs panel until dismissed. Successful terminal jobs auto-dismiss after a short delay.

## Testing Requirements

Main manager tests should cover:

- Enqueue emits `created` and begins with all items pending except the active item.
- Successful sequential deletion moves each item through `deleting` to `deleted`.
- One item failure does not stop later pending items.
- Final status is `failed` when any item failed.
- Cancel request lets the current deleting item finish and marks remaining pending items `cancelled`.
- Final status is `cancelled` when cancellation happens without item failures.
- Dismiss removes terminal jobs and emits `dismissed`.
- Active conflict detection catches paths already included in running delete jobs.

Renderer provider tests should cover:

- Initial `worktreeDelete:list` load.
- Event merge for `created`, `updated`, `completed`, and `dismissed`.
- `refreshRepo(repoId)` is called when an item newly transitions to `deleted`.
- Successful completed jobs auto-dismiss.
- Failed and cancelled jobs remain visible until dismissed.

Confirmation modal tests should cover:

- Confirm calls `worktreeDelete:start` with selected non-main targets.
- Successful start closes the modal and exits selection mode without waiting for item deletion.
- Start failure leaves the modal open and reports the error through a toast.
- Confirm is disabled when there are no selected non-main targets.

Manual verification should cover:

- The modal closes immediately after a successful start.
- The user can interact with other worktrees while deletion continues.
- The Background Jobs panel shows per-worktree statuses.
- Deleted worktrees disappear from Rail/Grid as each item completes.
- A failed item stays visible and does not block later items.
- `Cancel Pending` leaves the current deleting item alone and cancels pending items.
- Successful jobs auto-disappear after a short delay.
- Failed jobs remain until dismissed.

Required commands before completion:

```bash
pnpm vitest run <focused-delete-manager-tests>
pnpm vitest run <focused-renderer-delete-tests>
pnpm typecheck
pnpm lint
```

Because this changes runtime UI behavior, final verification should also run the app with `pnpm dev` and inspect it through `playwright-electron`.
