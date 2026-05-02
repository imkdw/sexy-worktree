import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut, RepoConfigDto } from "@shared/ipc";
import { loadRepoConfig } from "../config/load";
import { repoConfigSchema } from "../config/schema";
import { saveJiraConfig } from "../config/saveJira";
import { saveRepositoryConfig } from "../config/saveRepository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSaveJiraArgs(value: unknown): value is IpcIn<"config:saveJira"> {
  if (!isRecord(value)) return false;
  if (typeof value.repoPath !== "string") return false;
  if (!isRecord(value.jira)) return false;

  return (
    value.jira.enabled === true &&
    typeof value.jira.workspaceUrl === "string" &&
    typeof value.jira.email === "string" &&
    typeof value.jira.tokenKeychainKey === "string"
  );
}

function isSaveRepositoryArgs(value: unknown): value is IpcIn<"config:saveRepository"> {
  if (!isRecord(value)) return false;
  if (typeof value.repoPath !== "string") return false;
  return repoConfigSchema.safeParse(value.config).success;
}

export function registerConfigHandlers(): void {
  ipcMain.handle(
    "config:get",
    async (_e, args: IpcIn<"config:get">): Promise<IpcOut<"config:get">> => {
      const r = await loadRepoConfig(args.repoPath);
      if (!r.ok) return err(r.error);
      return ok({ config: r.value.config as RepoConfigDto, source: r.value.source });
    }
  );

  ipcMain.handle(
    "config:saveJira",
    async (_e, args: unknown): Promise<IpcOut<"config:saveJira">> => {
      if (!isSaveJiraArgs(args)) {
        return err({
          kind: "invalid",
          issues: ["config:saveJira payload is malformed"],
        });
      }

      const r = await saveJiraConfig({
        repoPath: args.repoPath,
        jira: args.jira,
      });

      if (!r.ok) return err(r.error);
      return ok({ config: r.value.config as RepoConfigDto, configPath: r.value.configPath });
    }
  );

  ipcMain.handle(
    "config:saveRepository",
    async (_e, args: unknown): Promise<IpcOut<"config:saveRepository">> => {
      if (!isSaveRepositoryArgs(args)) {
        return err({
          kind: "invalid",
          issues: ["config:saveRepository payload is malformed"],
        });
      }

      const r = await saveRepositoryConfig({
        repoPath: args.repoPath,
        config: args.config,
      });

      if (!r.ok) return err(r.error);
      return ok({ config: r.value.config as RepoConfigDto, configPath: r.value.configPath });
    }
  );
}
