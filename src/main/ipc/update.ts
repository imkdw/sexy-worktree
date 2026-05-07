import { ipcMain, type BrowserWindow } from "electron";
import { ok } from "@shared/result";
import type { AppUpdateEvent, IpcOut } from "@shared/ipc";
import { updateManager } from "../update/manager";

let getWindowForUpdateEvents: (() => BrowserWindow | null) | null = null;
let unsubscribeUpdateEvents: (() => void) | null = null;
let handlersRegistered = false;

function isWindowDestroyed(win: BrowserWindow): boolean {
  if (typeof win.isDestroyed === "function" && win.isDestroyed()) return true;
  if (typeof win.webContents.isDestroyed === "function" && win.webContents.isDestroyed()) {
    return true;
  }

  return false;
}

export function registerUpdateHandlers(getWindow: () => BrowserWindow | null): void {
  getWindowForUpdateEvents = getWindow;

  if (!unsubscribeUpdateEvents) {
    unsubscribeUpdateEvents = updateManager.onEvent((event: AppUpdateEvent) => {
      const win = getWindowForUpdateEvents?.() ?? null;
      if (!win) return;
      if (isWindowDestroyed(win)) return;

      win.webContents.send("update:event", event);
    });
  }

  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("update:getState", async (): Promise<IpcOut<"update:getState">> => {
    return ok({ state: updateManager.getState() });
  });

  ipcMain.handle("update:check", async (): Promise<IpcOut<"update:check">> => {
    return updateManager.check({ silent: false });
  });

  ipcMain.handle("update:download", async (): Promise<IpcOut<"update:download">> => {
    return updateManager.download();
  });

  ipcMain.handle("update:openDownloaded", async (): Promise<IpcOut<"update:openDownloaded">> => {
    return updateManager.openDownloaded();
  });
}
