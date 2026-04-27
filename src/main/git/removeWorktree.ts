import { rm } from "node:fs/promises";
import { ok, err, type Result } from "@shared/result";
import { gitExec } from "./exec";

/**
 * 워크트리를 강제로 제거한다.
 *
 * `git worktree remove --force`로 메타데이터를 정리한 뒤,
 * CLAUDE.md의 강제 규칙에 따라 항상 디렉터리를 `rm -rf`로 제거한다.
 *
 * @param args.repoPath 메인 저장소 경로
 * @param args.worktreePath 제거할 워크트리 경로
 */
export async function removeWorktree(args: {
  repoPath: string;
  worktreePath: string;
}): Promise<Result<void, { stderr: string }>> {
  await gitExec(["worktree", "remove", "--force", args.worktreePath], {
    cwd: args.repoPath,
    timeoutMs: 30_000,
  });
  // CLAUDE.md 강제 규칙에 따라 항상 rm -rf 폴백을 수행한다

  try {
    await rm(args.worktreePath, { recursive: true, force: true });
  } catch (e) {
    return err({ stderr: (e as Error).message });
  }
  return ok(undefined);
}
