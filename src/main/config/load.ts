import { readFile } from "node:fs/promises";
import { ok, err, type Result } from "@shared/result";
import { repoConfigSchema, type RepoConfig } from "./schema";
import { DEFAULT_CONFIG } from "./defaults";
import { repoConfigPath } from "./path";

export type ConfigLoadError =
  | { kind: "invalid"; issues: string[] }
  | { kind: "unreadable"; message: string };

export type LoadedConfig = {
  config: RepoConfig;
  source: "file" | "defaults";
};

export async function loadRepoConfig(
  repoPath: string
): Promise<Result<LoadedConfig, ConfigLoadError>> {
  const file = repoConfigPath(repoPath);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return ok({ config: DEFAULT_CONFIG, source: "defaults" });
    }
    return err({ kind: "unreadable", message: (e as Error).message });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return err({ kind: "invalid", issues: [(e as Error).message] });
  }
  const result = repoConfigSchema.safeParse(parsed);
  if (!result.success) {
    return err({
      kind: "invalid",
      issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  return ok({ config: result.data, source: "file" });
}
