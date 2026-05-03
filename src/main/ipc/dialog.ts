import { dialog, ipcMain, type BrowserWindow } from "electron";
import { ok } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";

export function registerDialogHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    "dialog:selectDirectory",
    async (
      _e,
      args: IpcIn<"dialog:selectDirectory">
    ): Promise<IpcOut<"dialog:selectDirectory">> => {
      const win = getWindow();
      const opts = {
        title: args.title,
        properties: ["openDirectory" as const],
        ...(args.defaultPath ? { defaultPath: args.defaultPath } : {}),
      };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (r.canceled || r.filePaths.length === 0) return ok(null);
      return ok({ path: r.filePaths[0]! });
    }
  );
}
