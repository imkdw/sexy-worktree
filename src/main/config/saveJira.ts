import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ok, err, type Result } from "@shared/result";
import { repoConfigSchema, type RepoConfig } from "./schema";
import { loadRepoConfig, type ConfigLoadError } from "./load";
import { repoConfigPath } from "./path";

export type SaveJiraConfigError =
  | ConfigLoadError
  | { kind: "write-failed"; message: string };

export type SaveJiraConfigInput = {
  repoPath: string;
  jira: NonNullable<RepoConfig["jira"]>;
};

export async function saveJiraConfig(
  args: SaveJiraConfigInput
): Promise<
  Result<{ config: RepoConfig; configPath: string }, SaveJiraConfigError>
> {
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

  const parsed = repoConfigSchema.safeParse(nextConfig);
  if (!parsed.success) {
    return err({
      kind: "invalid",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
  }

  let tempPath: string | undefined;

  try {
    await mkdir(configDir, { recursive: true });
    tempPath = `${configPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    await rename(tempPath, configPath);
  } catch (error) {
    if (tempPath !== undefined) {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
    return err({ kind: "write-failed", message: (error as Error).message });
  }

  return ok({ config: parsed.data, configPath });
}
