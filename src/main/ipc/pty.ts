import { ipcMain, type BrowserWindow } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut, PtyDataEvent, PtyExitEvent } from "@shared/ipc";
import { CwdMissingError, PtyManager } from "../pty/manager";

export const ptyManager = new PtyManager();

export function registerPtyHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    "pty:spawn",
    async (_e, args: IpcIn<"pty:spawn">): Promise<IpcOut<"pty:spawn">> => {
      try {
        const id = ptyManager.spawn(args);
        ptyManager.onData(id, (data) => {
          const win = getWindow();
          if (!win) return;
          const evt: PtyDataEvent = { id, data };
          win.webContents.send("pty:data", evt);
        });
        ptyManager.onExit(id, (exitCode, signal, lastBytes) => {
          const win = getWindow();
          if (!win) return;
          const evt: PtyExitEvent = { id, exitCode, signal, lastBytes };
          win.webContents.send("pty:exit", evt);
        });
        return ok({ id });
      } catch (e) {
        if (e instanceof CwdMissingError) {
          return err({ kind: "cwd-missing", cwd: e.cwd, message: e.message });
        }
        return err({ kind: "unknown", message: (e as Error).message });
      }
    }
  );

  ipcMain.handle(
    "pty:write",
    async (_e, args: IpcIn<"pty:write">): Promise<IpcOut<"pty:write">> => {
      ptyManager.write(args.id, args.data);
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "pty:resize",
    async (_e, args: IpcIn<"pty:resize">): Promise<IpcOut<"pty:resize">> => {
      ptyManager.resize(args.id, args.cols, args.rows);
      return ok(undefined);
    }
  );

  ipcMain.handle("pty:kill", async (_e, args: IpcIn<"pty:kill">): Promise<IpcOut<"pty:kill">> => {
    ptyManager.kill(args.id);
    return ok(undefined);
  });
}
