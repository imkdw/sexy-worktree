import { dialog, ipcMain, type BrowserWindow } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { getDb } from "../db";
import { upsertRepo, listRepos, setActiveRepo, getActiveRepoId, closeRepo } from "../db/repos";
import { addRecent } from "../db/recents";
import { validateRepo } from "../git/validate";

export function registerRepoHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("repo:openDialog", async (): Promise<IpcOut<"repo:openDialog">> => {
    const win = getWindow();
    const opts = {
      title: "Open Repository",
      properties: ["openDirectory" as const],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || r.filePaths.length === 0) return ok(null);
    return ok({ path: r.filePaths[0]! });
  });

  ipcMain.handle(
    "repo:validate",
    async (_e, args: IpcIn<"repo:validate">): Promise<IpcOut<"repo:validate">> => {
      return await validateRepo(args.path);
    }
  );

  ipcMain.handle("repo:add", async (_e, args: IpcIn<"repo:add">): Promise<IpcOut<"repo:add">> => {
    try {
      const row = upsertRepo(getDb(), { path: args.path, name: args.name });
      setActiveRepo(getDb(), row.id);
      addRecent(getDb(), { path: args.path, name: args.name });
      return ok(row);
    } catch (e) {
      return err({ message: (e as Error).message });
    }
  });

  ipcMain.handle("repo:list", async (): Promise<IpcOut<"repo:list">> => {
    return ok({ repos: listRepos(getDb()), activeRepoId: getActiveRepoId(getDb()) });
  });

  ipcMain.handle(
    "repo:setActive",
    async (_e, args: IpcIn<"repo:setActive">): Promise<IpcOut<"repo:setActive">> => {
      try {
        setActiveRepo(getDb(), args.id);
        return ok(undefined);
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );

  ipcMain.handle(
    "repo:close",
    async (_e, args: IpcIn<"repo:close">): Promise<IpcOut<"repo:close">> => {
      try {
        closeRepo(getDb(), args.id);
        return ok(undefined);
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );
}
