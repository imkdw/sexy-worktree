import { describe, expect, it } from "vitest";
import type { WorktreeInfo } from "@main/git/worktrees";
import { validateDeleteTargets } from "@main/worktreeDelete/validate";

function worktree(overrides: Partial<WorktreeInfo> & Pick<WorktreeInfo, "path">): WorktreeInfo {
  return {
    path: overrides.path,
    branch: "branch" in overrides ? overrides.branch! : (overrides.path.split("/").at(-1) ?? null),
    head: overrides.head ?? "abc123",
    isMain: overrides.isMain ?? false,
  };
}

describe("validateDeleteTargets", () => {
  it("returns normalized targets with current branch values from currentWorktrees", () => {
    const result = validateDeleteTargets({
      targets: [
        { worktreePath: "/repo/wt-a", branch: "stale-a" },
        { worktreePath: "/repo/wt-b", branch: "stale-b" },
      ],
      currentWorktrees: [
        worktree({ path: "/repo", branch: "main", isMain: true }),
        worktree({ path: "/repo/wt-a", branch: "feature/a" }),
        worktree({ path: "/repo/wt-b", branch: null }),
      ],
      activeConflict: null,
    });

    expect(result).toEqual({
      ok: true,
      value: [
        { worktreePath: "/repo/wt-a", branch: "feature/a" },
        { worktreePath: "/repo/wt-b", branch: null },
      ],
    });
  });

  it("rejects empty target lists", () => {
    const result = validateDeleteTargets({
      targets: [],
      currentWorktrees: [worktree({ path: "/repo", isMain: true })],
      activeConflict: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { message: "No worktrees selected for deletion" },
    });
  });

  it("rejects duplicate target paths", () => {
    const result = validateDeleteTargets({
      targets: [
        { worktreePath: "/repo/wt-a", branch: "feature/a" },
        { worktreePath: "/repo/wt-a", branch: "feature/a" },
      ],
      currentWorktrees: [
        worktree({ path: "/repo", isMain: true }),
        worktree({ path: "/repo/wt-a", branch: "feature/a" }),
      ],
      activeConflict: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { message: "Duplicate delete target: /repo/wt-a" },
    });
  });

  it("rejects missing worktrees", () => {
    const result = validateDeleteTargets({
      targets: [{ worktreePath: "/repo/missing", branch: "missing" }],
      currentWorktrees: [worktree({ path: "/repo", isMain: true })],
      activeConflict: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { message: "Worktree is no longer available: /repo/missing" },
    });
  });

  it("rejects the main worktree", () => {
    const result = validateDeleteTargets({
      targets: [{ worktreePath: "/repo", branch: "main" }],
      currentWorktrees: [worktree({ path: "/repo", branch: "main", isMain: true })],
      activeConflict: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { message: "Main worktree cannot be deleted: /repo" },
    });
  });

  it("rejects paths already included in a running delete job", () => {
    const result = validateDeleteTargets({
      targets: [{ worktreePath: "/repo/wt-a", branch: "feature/a" }],
      currentWorktrees: [
        worktree({ path: "/repo", isMain: true }),
        worktree({ path: "/repo/wt-a", branch: "feature/a" }),
      ],
      activeConflict: { existingPath: "/repo/wt-a" },
    });

    expect(result).toEqual({
      ok: false,
      error: { message: "Worktree is already being deleted: /repo/wt-a" },
    });
  });
});
