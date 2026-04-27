import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut, RepoConfigDto } from "@shared/ipc";
import { loadRepoConfig } from "../config/load";

export function registerConfigHandlers(): void {
  ipcMain.handle(
    "config:get",
    async (_e, args: IpcIn<"config:get">): Promise<IpcOut<"config:get">> => {
      const r = await loadRepoConfig(args.repoPath);
      if (!r.ok) return err(r.error);
      return ok({ config: r.value.config as RepoConfigDto, source: r.value.source });
    }
  );
}
