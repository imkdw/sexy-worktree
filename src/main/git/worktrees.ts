import { ok, type Result, err } from "@shared/result";
import { gitExec, type GitError } from "./exec";

export type WorktreeInfo = {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
};

export function parseWorktreePorcelain(stdout: string): WorktreeInfo[] {
  const blocks = stdout
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((block, i) => {
    const lines = block.split("\n");
    const get = (prefix: string): string | undefined =>
      lines
        .find((l) => l.startsWith(prefix + " "))
        ?.slice(prefix.length + 1)
        .trim();
    const path = get("worktree") ?? "";
    const head = get("HEAD") ?? "";
    const branchRef = get("branch");
    const detached = lines.some((l) => l.trim() === "detached");
    const branch = detached ? null : branchRef ? branchRef.replace(/^refs\/heads\//, "") : null;
    return { path, branch, head, isMain: i === 0 };
  });
}

export async function listWorktrees(repoPath: string): Promise<Result<WorktreeInfo[], GitError>> {
  const r = await gitExec(["worktree", "list", "--porcelain"], {
    cwd: repoPath,
    timeoutMs: 10_000,
  });
  if (!r.ok) return err(r.error);
  return ok(parseWorktreePorcelain(r.value));
}
