import { loadRepoConfig, type LoadedConfig } from "./load";

const cache = new Map<string, LoadedConfig>();

/**
 * 저장소 경로별 설정을 메모리 캐시에서 가져오거나 디스크에서 로드한다.
 *
 * 캐시 미스 시 `loadRepoConfig`를 호출해 결과를 캐시에 저장한다.
 * 설정 파일이 유효하지 않으면 호출자에게 에러를 던져 상위에서 처리하도록 한다.
 *
 * @param repoPath 저장소 절대 경로
 * @throws 설정 파일이 유효하지 않을 때
 */
export async function getRepoConfig(repoPath: string): Promise<LoadedConfig> {
  const cached = cache.get(repoPath);
  if (cached) return cached;
  const r = await loadRepoConfig(repoPath);
  if (r.ok) {
    cache.set(repoPath, r.value);
    return r.value;
  }
  // 설정 파일이 유효하지 않으면 기본값으로 폴백하지 않고 상위에 에러를 위임한다
  throw new Error(`config invalid at ${repoPath}: ${JSON.stringify(r.error)}`);
}

/**
 * 특정 저장소의 설정 캐시 항목을 무효화한다.
 * 설정 파일이 외부에서 갱신됐을 때 호출한다.
 */
export function invalidateRepoConfig(repoPath: string): void {
  cache.delete(repoPath);
}
