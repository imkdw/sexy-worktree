// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type DeleteWorktreeJobsState = {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
};

const deleteWorktreeJobs = vi.hoisted((): { state: DeleteWorktreeJobsState } => ({
  state: {
    jobs: [],
    cancel: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@renderer/state/deleteWorktree", () => ({
  useDeleteWorktreeJobs: () => deleteWorktreeJobs.state,
}));

import { BackgroundJobsPanel } from "@renderer/backgroundJobs/BackgroundJobsPanel";

function item(
  worktreePath: string,
  branch: string | null,
  status: DeleteWorktreeJobSnapshot["items"][number]["status"],
  errorMessage: string | null = null
): DeleteWorktreeJobSnapshot["items"][number] {
  const terminal = status === "deleted" || status === "failed" || status === "cancelled";

  return {
    worktreePath,
    branch,
    status,
    errorMessage,
    startedAt: status === "pending" ? null : 10,
    finishedAt: terminal ? 20 : null,
  };
}

function job(
  id: string,
  overrides: Partial<DeleteWorktreeJobSnapshot> = {}
): DeleteWorktreeJobSnapshot {
  const status = overrides.status ?? "running";

  return {
    id,
    repoId: 1,
    repoPath: "/repo",
    status,
    items: [item("/repo/worktrees/feature-one", "feature/one", "pending")],
    cancelRequested: false,
    createdAt: 1,
    finishedAt: status === "running" ? null : 30,
    ...overrides,
  };
}

async function mountPanel(): Promise<{ container: HTMLDivElement; unmount: () => void }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(BackgroundJobsPanel));
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function setDeleteWorktreeState(overrides: Partial<DeleteWorktreeJobsState>): void {
  deleteWorktreeJobs.state = {
    jobs: [],
    cancel: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
}

function findButton(label: string, root: ParentNode = document): HTMLButtonElement {
  const button = [...root.querySelectorAll("button")].find(
    (element) => element.textContent?.replace(/\s+/g, " ").trim() === label
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button as HTMLButtonElement;
}

function findJobSection(label: string): HTMLElement {
  const section = [...document.querySelectorAll("section")].find((element) =>
    element.textContent?.includes(label)
  );
  if (!section) throw new Error(`job section not found: ${label}`);
  return section as HTMLElement;
}

async function clickButton(label: string, root: ParentNode = document): Promise<void> {
  const button = findButton(label, root);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("BackgroundJobsPanel", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
    setDeleteWorktreeState({});
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("renders nothing when there are no jobs", async () => {
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    expect(mounted.container.firstElementChild).toBeNull();
    expect(document.body.textContent).toBe("");
  });

  it("renders delete job progress, branch labels, and detached fallback", async () => {
    setDeleteWorktreeState({
      jobs: [
        job("job-progress", {
          items: [
            item("/repo/worktrees/feature-one", "feature/one", "deleted"),
            item("/repo/worktrees/feature-two", "feature/two", "deleting"),
            item("/repo/worktrees/detached", null, "pending"),
          ],
        }),
      ],
    });

    const mounted = await mountPanel();
    cleanup = mounted.unmount;
    const text = document.body.textContent ?? "";

    expect(text).toContain("Background Jobs");
    expect(text).toContain("Deleting worktrees");
    expect(text).toContain("1 / 3 deleted");
    expect(text).toContain("feature/one");
    expect(text).toContain("feature/two");
    expect(text).toContain("(detached)");
    expect(text).toContain("Deleting");
    expect(text).toContain("Pending");
  });

  it("uses a governed width that can shrink inside the shell", async () => {
    setDeleteWorktreeState({
      jobs: [job("job-width")],
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    const panel = document.querySelector("aside");

    expect(panel?.className).toContain("w-toast");
    expect(panel?.className).toContain("max-w-full");
    expect(panel?.className).toContain("shrink");
    expect(panel?.className).not.toContain("shrink-0");
  });

  it("shows Cancel Pending for running jobs and calls cancel with the job id", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    setDeleteWorktreeState({
      jobs: [job("job-running")],
      cancel,
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Cancel Pending");
    await clickButton("Cancel Pending");

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("job-running");
  });

  it("passes the clicked running job id when multiple jobs show Cancel Pending", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    setDeleteWorktreeState({
      jobs: [
        job("job-first", {
          items: [item("/repo/worktrees/feature-first", "feature/first", "pending")],
        }),
        job("job-second", {
          items: [item("/repo/worktrees/feature-second", "feature/second", "pending")],
        }),
      ],
      cancel,
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    await clickButton("Cancel Pending", findJobSection("feature/second"));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("job-second");
  });

  it("disables Cancel Pending when cancellation is already requested", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    setDeleteWorktreeState({
      jobs: [
        job("job-cancelling", {
          cancelRequested: true,
        }),
      ],
      cancel,
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    expect(findButton("Cancel Pending").disabled).toBe(true);
  });

  it("shows failed and cancelled counts, compact errors, and Dismiss for terminal jobs", async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    setDeleteWorktreeState({
      jobs: [
        job("job-failed", {
          status: "failed",
          items: [
            item("/repo/worktrees/feature-one", "feature/one", "deleted"),
            item("/repo/worktrees/feature-two", "feature/two", "failed", "Permission denied"),
            item("/repo/worktrees/detached", null, "cancelled"),
          ],
        }),
      ],
      dismiss,
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;
    const text = document.body.textContent ?? "";

    expect(text).toContain("1 / 3 deleted");
    expect(text).toContain("1 failed");
    expect(text).toContain("1 cancelled");
    expect(text).toContain("Permission denied");
    expect(text).toContain("Dismiss");

    await clickButton("Dismiss");

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("job-failed");
  });

  it("passes the clicked terminal job id when multiple jobs show Dismiss", async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    setDeleteWorktreeState({
      jobs: [
        job("job-first-failed", {
          status: "failed",
          items: [item("/repo/worktrees/feature-first", "feature/first", "failed", "first")],
        }),
        job("job-second-cancelled", {
          status: "cancelled",
          items: [
            item("/repo/worktrees/feature-second", "feature/second", "cancelled", null),
          ],
        }),
      ],
      dismiss,
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    await clickButton("Dismiss", findJobSection("feature/second"));

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("job-second-cancelled");
  });

  it("does not show Dismiss for fully successful done jobs", async () => {
    setDeleteWorktreeState({
      jobs: [
        job("job-done", {
          status: "done",
          items: [item("/repo/worktrees/feature-done", "feature/done", "deleted")],
        }),
      ],
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("feature/done");
    expect(document.body.textContent).not.toContain("Dismiss");
  });

  it("keeps status icons hidden from assistive names because status text is visible", async () => {
    setDeleteWorktreeState({
      jobs: [
        job("job-icons", {
          items: [
            item("/repo/worktrees/feature-one", "feature/one", "pending"),
            item("/repo/worktrees/feature-two", "feature/two", "deleting"),
            item("/repo/worktrees/feature-three", "feature/three", "deleted"),
            item("/repo/worktrees/feature-four", "feature/four", "failed", "failed"),
            item("/repo/worktrees/feature-five", "feature/five", "cancelled"),
          ],
        }),
      ],
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    for (const icon of document.querySelectorAll("svg")) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.hasAttribute("aria-label")).toBe(false);
    }
  });

  it("preserves full failed messages in a title while keeping them compact", async () => {
    const errorMessage = "Permission denied while deleting nested generated files";
    setDeleteWorktreeState({
      jobs: [
        job("job-error", {
          status: "failed",
          items: [item("/repo/worktrees/feature-error", "feature/error", "failed", errorMessage)],
        }),
      ],
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    const error = document.querySelector("p.text-destructive");

    expect(error?.textContent).toBe(errorMessage);
    expect(error?.getAttribute("title")).toBe(errorMessage);
    expect(error?.className).toContain("overflow-hidden");
    expect(error?.className).toContain("text-ellipsis");
    expect(error?.className).toContain("whitespace-nowrap");
  });

  it("uses token-based focus-visible styles on action buttons", async () => {
    setDeleteWorktreeState({
      jobs: [
        job("job-running-focus"),
        job("job-failed-focus", {
          status: "failed",
          items: [item("/repo/worktrees/feature-failed", "feature/failed", "failed", "failed")],
        }),
      ],
    });
    const mounted = await mountPanel();
    cleanup = mounted.unmount;

    expect(findButton("Cancel Pending").className).toContain("focus-visible:outline-accent-soft");
    expect(findButton("Dismiss").className).toContain("focus-visible:outline-accent-soft");
  });
});
