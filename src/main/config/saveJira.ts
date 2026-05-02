import { lstat } from "node:fs/promises";
import { dirname } from "node:path";
import { ok, err, type Result } from "@shared/result";
import type { RepoConfig } from "./schema";
import { loadRepoConfig, type ConfigLoadError } from "./load";
import { repoConfigPath } from "./path";
import { saveRepositoryConfig, type SaveRepositoryConfigError } from "./saveRepository";

export type SaveJiraConfigError = ConfigLoadError | SaveRepositoryConfigError;

export type SaveJiraConfigInput = {
  repoPath: string;
  jira: NonNullable<RepoConfig["jira"]>;
};

export async function saveJiraConfig(
  args: SaveJiraConfigInput
): Promise<Result<{ config: RepoConfig; configPath: string }, SaveJiraConfigError>> {
  const configPath = repoConfigPath(args.repoPath);
  const configDir = dirname(configPath);
  const loaded = await loadRepoConfig(args.repoPath);
  if (!loaded.ok) {
    if (loaded.error.kind === "unreadable") {
      try {
        const stats = await lstat(configDir);
        if (!stats.isDirectory()) {
          return err({
            kind: "write-failed",
            message: `${configDir} is not a directory`,
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          return err(loaded.error);
        }
      }
    }

    return err(loaded.error);
  }

  const nextConfig: RepoConfig = {
    ...loaded.value.config,
    jira: args.jira,
  };

  const saved = await saveRepositoryConfig({ repoPath: args.repoPath, config: nextConfig });
  if (!saved.ok) return err(saved.error);

  return ok(saved.value);
}
