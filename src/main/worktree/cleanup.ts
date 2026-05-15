import { realpath, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { ok, err, type Result } from "@shared/result";
import { gitExec } from "../git/exec";
import { listWorktrees } from "../git/worktrees";

type CleanupError = { stderr: string };

export async function cleanupGeneratedWorktree(args: {
  repoPath: string;
  worktreePath: string;
  branchName: string;
  removeBranch: boolean;
}): Promise<Result<void, CleanupError>> {
  const worktrees = await listWorktrees(args.repoPath);
  if (!worktrees.ok) return err({ stderr: worktrees.error.stderr });

  const worktreePath = await normalizedPath(args.worktreePath);
  let matchingWorktree: (typeof worktrees.value)[number] | undefined;
  for (const worktree of worktrees.value) {
    if (worktree.branch !== args.branchName) continue;
    if ((await normalizedPath(worktree.path)) === worktreePath) {
      matchingWorktree = worktree;
      break;
    }
  }

  if (matchingWorktree) {
    const removed = await gitExec(["worktree", "remove", "--force", args.worktreePath], {
      cwd: args.repoPath,
      timeoutMs: 120_000,
    });
    if (!removed.ok) return err({ stderr: removed.error.stderr });

    try {
      await rm(args.worktreePath, { recursive: true, force: true });
    } catch (e) {
      return err({ stderr: (e as Error).message });
    }
  }

  if (!args.removeBranch) return ok(undefined);

  const currentWorktrees = matchingWorktree ? await listWorktrees(args.repoPath) : worktrees;
  if (!currentWorktrees.ok) return err({ stderr: currentWorktrees.error.stderr });

  const branchStillCheckedOut = currentWorktrees.value.some(
    (worktree) => worktree.branch === args.branchName
  );
  if (branchStillCheckedOut) {
    return err({ stderr: `Branch is still checked out: ${args.branchName}` });
  }

  const branchExists = await gitExec(["rev-parse", "--verify", `refs/heads/${args.branchName}`], {
    cwd: args.repoPath,
    timeoutMs: 30_000,
  });
  if (!branchExists.ok) return ok(undefined);

  const deleted = await gitExec(["branch", "-D", "--", args.branchName], {
    cwd: args.repoPath,
    timeoutMs: 30_000,
  });
  return deleted.ok ? ok(undefined) : err({ stderr: deleted.error.stderr });
}

async function normalizedPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}
