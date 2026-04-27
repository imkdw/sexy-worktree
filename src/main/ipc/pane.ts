import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { getDb } from "../db";
import { savePaneTree, loadPaneTree } from "../db/panes";

export function registerPaneHandlers(): void {
  ipcMain.handle(
    "pane:load",
    async (_e, args: IpcIn<"pane:load">): Promise<IpcOut<"pane:load">> => {
      const tree = loadPaneTree(getDb(), args.repoId, args.worktreePath);
      return ok({ tree });
    }
  );

  ipcMain.handle(
    "pane:save",
    async (_e, args: IpcIn<"pane:save">): Promise<IpcOut<"pane:save">> => {
      try {
        savePaneTree(getDb(), args.repoId, args.worktreePath, args.tree);
        return ok(undefined);
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );
}
