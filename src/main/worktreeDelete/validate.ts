import type { DeleteWorktreeTarget } from "@shared/deleteWorktree";
import { err, ok, type Result } from "@shared/result";
import type { WorktreeInfo } from "../git/worktrees";

export type ValidateDeleteTargetsArgs = {
  targets: DeleteWorktreeTarget[];
  currentWorktrees: WorktreeInfo[];
  activeConflict: { existingPath: string } | null;
};

export function validateDeleteTargets(
  args: ValidateDeleteTargetsArgs
): Result<DeleteWorktreeTarget[], { message: string }> {
  if (args.targets.length === 0) {
    return err({ message: "No worktrees selected for deletion" });
  }

  if (args.activeConflict) {
    return err({
      message: `Worktree is already being deleted: ${args.activeConflict.existingPath}`,
    });
  }

  const currentByPath = new Map(args.currentWorktrees.map((worktree) => [worktree.path, worktree]));
  const seenPaths = new Set<string>();
  const normalized: DeleteWorktreeTarget[] = [];

  for (const target of args.targets) {
    if (seenPaths.has(target.worktreePath)) {
      return err({ message: `Duplicate delete target: ${target.worktreePath}` });
    }
    seenPaths.add(target.worktreePath);

    const current = currentByPath.get(target.worktreePath);
    if (!current) {
      return err({ message: `Worktree is no longer available: ${target.worktreePath}` });
    }

    if (current.isMain) {
      return err({ message: `Main worktree cannot be deleted: ${current.path}` });
    }

    normalized.push({
      worktreePath: current.path,
      branch: current.branch,
    });
  }

  return ok(normalized);
}
