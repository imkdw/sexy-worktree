import { randomUUID } from "node:crypto";
import { ipcMain, type BrowserWindow } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut, WorktreeDeleteJobEvent } from "@shared/ipc";
import { getDb } from "../db";
import { listRepos } from "../db/repos";
import { removeWorktree } from "../git/removeWorktree";
import { listWorktrees } from "../git/worktrees";
import { DeleteWorktreeManager } from "../worktreeDelete/manager";
import { validateDeleteTargets } from "../worktreeDelete/validate";

export const deleteWorktreeManager = new DeleteWorktreeManager();

let getWindowForDeleteEvents: (() => BrowserWindow | null) | null = null;
let unsubscribeDeleteWorktreeEvents: (() => void) | null = null;

function isValidDeleteStartArgs(args: unknown): args is IpcIn<"worktreeDelete:start"> {
  if (!args || typeof args !== "object") return false;
  const maybeArgs = args as Partial<IpcIn<"worktreeDelete:start">>;
  return (
    typeof maybeArgs.repoId === "number" &&
    Number.isFinite(maybeArgs.repoId) &&
    Array.isArray(maybeArgs.targets)
  );
}

export function registerWorktreeDeleteHandlers(getWindow: () => BrowserWindow | null): void {
  getWindowForDeleteEvents = getWindow;
  if (!unsubscribeDeleteWorktreeEvents) {
    unsubscribeDeleteWorktreeEvents = deleteWorktreeManager.onEvent((event) => {
      const win = getWindowForDeleteEvents?.();
      if (!win) return;
      const evt: WorktreeDeleteJobEvent = event;
      win.webContents.send("worktreeDelete:event", evt);
    });
  }

  ipcMain.handle(
    "worktree:remove",
    async (_e, args: IpcIn<"worktree:remove">): Promise<IpcOut<"worktree:remove">> => {
      const r = await removeWorktree(args);
      if (!r.ok) return err({ message: r.error.stderr });
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "worktreeDelete:start",
    async (
      _e,
      args: IpcIn<"worktreeDelete:start">
    ): Promise<IpcOut<"worktreeDelete:start">> => {
      if (!isValidDeleteStartArgs(args)) return err({ message: "Invalid delete request" });

      const repo = listRepos(getDb()).find((row) => row.id === args.repoId);
      if (!repo) return err({ message: "Repository not found" });

      const listed = await listWorktrees(repo.path);
      if (!listed.ok) {
        const message =
          listed.error.stderr.trim().length > 0
            ? listed.error.stderr
            : "Failed to list worktrees";
        return err({ message });
      }

      const activeConflict = deleteWorktreeManager.findActiveConflict({
        repoId: repo.id,
        worktreePaths: args.targets.map((target) => target.worktreePath),
      });
      const validated = validateDeleteTargets({
        targets: args.targets,
        currentWorktrees: listed.value,
        activeConflict,
      });
      if (!validated.ok) return err(validated.error);

      const jobId = randomUUID();
      deleteWorktreeManager.enqueue({
        jobId,
        repoId: repo.id,
        repoPath: repo.path,
        targets: validated.value,
      });
      return ok({ jobId });
    }
  );

  ipcMain.handle(
    "worktreeDelete:cancel",
    async (
      _e,
      args: IpcIn<"worktreeDelete:cancel">
    ): Promise<IpcOut<"worktreeDelete:cancel">> => {
      if (!deleteWorktreeManager.cancel(args.jobId)) {
        return err({ message: "Delete job is not running" });
      }
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "worktreeDelete:dismiss",
    async (
      _e,
      args: IpcIn<"worktreeDelete:dismiss">
    ): Promise<IpcOut<"worktreeDelete:dismiss">> => {
      if (!deleteWorktreeManager.dismiss(args.jobId)) {
        return err({ message: "Delete job cannot be dismissed" });
      }
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "worktreeDelete:list",
    async (
      _e,
      args: IpcIn<"worktreeDelete:list">
    ): Promise<IpcOut<"worktreeDelete:list">> => {
      return ok({ jobs: deleteWorktreeManager.list(args.repoId) });
    }
  );
}
