import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { err, ok, type Result } from "@shared/result";
import { repoConfigPath } from "./path";
import { repoConfigSchema, type RepoConfig } from "./schema";

export type SaveRepositoryConfigError =
  | { kind: "invalid"; issues: string[] }
  | { kind: "write-failed"; message: string };

export type SaveRepositoryConfigInput = {
  repoPath: string;
  config: RepoConfig;
};

export async function saveRepositoryConfig(
  args: SaveRepositoryConfigInput
): Promise<Result<{ config: RepoConfig; configPath: string }, SaveRepositoryConfigError>> {
  const parsed = repoConfigSchema.safeParse(args.config);
  if (!parsed.success) {
    return err({
      kind: "invalid",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
  }

  const configPath = repoConfigPath(args.repoPath);
  const configDir = dirname(configPath);
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
