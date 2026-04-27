import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { removeWorktree } from "../git/removeWorktree";

export function registerWorktreeDeleteHandlers(): void {
  ipcMain.handle(
    "worktree:remove",
    async (_e, args: IpcIn<"worktree:remove">): Promise<IpcOut<"worktree:remove">> => {
      const r = await removeWorktree(args);
      if (!r.ok) return err({ message: r.error.stderr });
      return ok(undefined);
    }
  );
}
