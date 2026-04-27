import { ipcMain } from "electron";
import { ok } from "@shared/result";
import type { IpcOut } from "@shared/ipc";
import { getDb } from "../db";
import { listRecents } from "../db/recents";

export function registerRecentsHandlers(): void {
  ipcMain.handle("recents:list", async (): Promise<IpcOut<"recents:list">> => {
    return ok({ recents: listRecents(getDb()) });
  });
}
