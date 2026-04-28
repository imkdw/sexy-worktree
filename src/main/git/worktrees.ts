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
  // 디렉터리가 사라진 워크트리는 git이 `prunable` 라인과 함께 그대로 반환하지만,
  // PTY를 spawn할 cwd가 없어 즉시 죽으므로 사용자에게 보이지 않도록 거른다.
  // 정리하려면 사용자가 `git worktree prune`을 직접 실행하면 된다.
  return blocks
    .map((block, i) => {
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
      const prunable = lines.some((l) => l.trim().startsWith("prunable"));
      return { path, branch, head, isMain: i === 0, prunable };
    })
    .filter((w) => !w.prunable)
    .map(({ prunable: _p, ...w }) => w);
}

export async function listWorktrees(repoPath: string): Promise<Result<WorktreeInfo[], GitError>> {
  const r = await gitExec(["worktree", "list", "--porcelain"], {
    cwd: repoPath,
    timeoutMs: 10_000,
  });
  if (!r.ok) return err(r.error);
  return ok(parseWorktreePorcelain(r.value));
}
