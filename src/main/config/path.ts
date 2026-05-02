import { join } from "node:path";

export function repoConfigPath(repoPath: string): string {
  return join(repoPath, ".sexyworktree", "config.json");
}
