import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { listWorktrees } from "../git/worktrees";

export function registerWorktreeHandlers(): void {
  ipcMain.handle(
    "worktree:list",
    async (_e, args: IpcIn<"worktree:list">): Promise<IpcOut<"worktree:list">> => {
      const r = await listWorktrees(args.repoPath);
      if (!r.ok) return err({ kind: "git-failed", stderr: r.error.stderr });
      return ok({ worktrees: r.value });
    }
  );
}
