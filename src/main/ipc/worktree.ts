import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { listWorktrees } from "../git/worktrees";
import {
  getWorktreeFileDiff,
  getWorktreeStatus,
  listWorktreeFiles,
  readWorktreeFile,
  writeWorktreeFile,
} from "../git/worktreeFiles";

export function registerWorktreeHandlers(): void {
  ipcMain.handle(
    "worktree:list",
    async (_e, args: IpcIn<"worktree:list">): Promise<IpcOut<"worktree:list">> => {
      const r = await listWorktrees(args.repoPath);
      if (!r.ok) return err({ kind: "git-failed", stderr: r.error.stderr });
      return ok({ worktrees: r.value });
    }
  );
  ipcMain.handle(
    "worktree:files",
    async (_e, args: IpcIn<"worktree:files">): Promise<IpcOut<"worktree:files">> => {
      const r = await listWorktreeFiles(args.worktreePath);
      if (!r.ok) return err(r.error);
      return ok({ entries: r.value });
    }
  );
  ipcMain.handle(
    "worktree:status",
    async (_e, args: IpcIn<"worktree:status">): Promise<IpcOut<"worktree:status">> => {
      const r = await getWorktreeStatus(args.worktreePath);
      if (!r.ok) return err(r.error);
      return ok({ changes: r.value });
    }
  );
  ipcMain.handle(
    "worktree:readFile",
    async (_e, args: IpcIn<"worktree:readFile">): Promise<IpcOut<"worktree:readFile">> => {
      return await readWorktreeFile(args.worktreePath, args.relativePath);
    }
  );
  ipcMain.handle(
    "worktree:writeFile",
    async (_e, args: IpcIn<"worktree:writeFile">): Promise<IpcOut<"worktree:writeFile">> => {
      return await writeWorktreeFile(args.worktreePath, args.relativePath, args.content);
    }
  );
  ipcMain.handle(
    "worktree:fileDiff",
    async (_e, args: IpcIn<"worktree:fileDiff">): Promise<IpcOut<"worktree:fileDiff">> => {
      return await getWorktreeFileDiff(args.worktreePath, args.relativePath);
    }
  );
}
