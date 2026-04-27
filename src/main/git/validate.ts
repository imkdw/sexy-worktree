import { exec } from "node:child_process";
import { promisify } from "node:util";
import { stat, realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import type { RepoValidationError } from "@shared/ipc";
import { ok, err, type Result } from "@shared/result";

const pexec = promisify(exec);

/**
 * 사용자가 선택한 경로가 유효한 메인 저장소인지 검증한다.
 *
 * 디렉터리 여부, 깃 작업 트리 여부, 그리고 워크트리 경로가 아닌 메인 저장소인지를
 * 차례로 확인한다. macOS의 `/var → /private/var` 같은 심볼릭 링크 변환을 고려해
 * git이 반환하는 실제 경로를 사용자가 보고 있는 경로로 다시 매핑한다.
 *
 * @param path 사용자가 선택한 디렉터리 경로
 * @returns 메인 저장소 정보 또는 검증 에러
 */
export async function validateRepo(
  path: string
): Promise<Result<{ name: string; canonicalPath: string }, RepoValidationError>> {
  // 1. 사용자가 입력한 형태 그대로 절대 경로로 정규화한다 (macOS의 /var → /private/var 같은 심볼릭 링크는 보존).
  const userPath = resolve(path);

  // 2. 디렉터리인지 확인한다.
  try {
    const s = await stat(userPath);
    if (!s.isDirectory()) return err({ kind: "not-a-directory" });
  } catch {
    return err({ kind: "not-a-directory" });
  }

  // 3. git 작업 트리 내부에 있어야 한다.
  try {
    await pexec("git rev-parse --is-inside-work-tree", { cwd: userPath });
  } catch {
    return err({ kind: "not-a-git-repo" });
  }

  // 4. git 비교에 사용할 실제 경로(realpath)로 변환한다 (macOS의 /tmp → /private/tmp 등 처리).
  let realUserPath: string;
  try {
    realUserPath = await realpath(userPath);
  } catch {
    return err({ kind: "not-a-directory" });
  }

  // 5. --porcelain으로 첫 번째 워크트리 항목(메인 저장소)을 가져온다. git은 항상 실제 경로를 반환한다.
  let realMainRepoPath = "";
  try {
    const { stdout } = await pexec("git worktree list --porcelain", { cwd: realUserPath });
    const firstWorktreeLine = stdout.split("\n").find((l) => l.startsWith("worktree "));
    if (!firstWorktreeLine) return err({ kind: "unknown", message: "no worktree entries" });
    realMainRepoPath = firstWorktreeLine.slice("worktree ".length).trim();
  } catch (e) {
    return err({ kind: "unknown", message: (e as Error).message });
  }

  // 6. 사용자 경로의 정규화된(toplevel) 경로를 가져온다. git은 실제 경로를 반환한다.
  let realCanonical: string;
  try {
    const { stdout } = await pexec("git rev-parse --show-toplevel", { cwd: realUserPath });
    realCanonical = stdout.trim();
  } catch (e) {
    return err({ kind: "unknown", message: (e as Error).message });
  }

  // 7. realUserPath 기준 상대 오프셋을 계산해, 사용자가 입력한(심볼릭 링크 가능성 있는) 형태로
  //    실제 경로를 다시 매핑한다.
  //    예: realUserPath=/private/var/…/wt, userPath=/var/…/wt,
  //        realCanonical=/private/var/…/main  →  userCanonical=/var/…/main
  const relCanonical = relative(realUserPath, realCanonical);
  const userCanonical = resolve(userPath, relCanonical);

  const relMain = relative(realUserPath, realMainRepoPath);
  const userMainRepoPath = resolve(userPath, relMain);

  if (userCanonical !== userMainRepoPath) {
    return err({ kind: "is-a-worktree", mainRepoPath: userMainRepoPath });
  }

  return ok({ name: basename(userCanonical), canonicalPath: userCanonical });
}
