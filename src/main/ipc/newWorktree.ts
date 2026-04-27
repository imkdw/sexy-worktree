import { ipcMain, type BrowserWindow } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut, NewWorktreeJobEvent } from "@shared/ipc";
import { Bootstrapper } from "../worktree/bootstrap";
import { listRepos } from "../db/repos";
import { getDb } from "../db";
import { loadRepoConfig } from "../config/load";
import { validateBranchName } from "@shared/branchValidation";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const bootstrapper = new Bootstrapper();

export function registerNewWorktreeHandlers(getWindow: () => BrowserWindow | null): void {
  bootstrapper.onEvent((e) => {
    const win = getWindow();
    if (!win) return;
    const evt: NewWorktreeJobEvent = e;
    win.webContents.send("newWorktree:event", evt);
  });

  ipcMain.handle(
    "newWorktree:create",
    async (_e, args: IpcIn<"newWorktree:create">): Promise<IpcOut<"newWorktree:create">> => {
      const repos = listRepos(getDb());
      const repo = repos.find((r) => r.id === args.repoId);
      if (!repo) return err({ kind: "config", message: "repo not found" });

      const cfg = await loadRepoConfig(repo.path);
      if (!cfg.ok) return err({ kind: "config", message: JSON.stringify(cfg.error) });

      const requireJira = cfg.value.config.branchValidation?.requireJiraPattern ?? false;
      const v = validateBranchName(args.branch, { requireJiraPattern: requireJira });
      if (!v.ok) return err({ kind: "invalid-branch", reason: v.reason });

      const baseDir = cfg.value.config.worktree.baseDir;
      const worktreePath = baseDir.startsWith("/")
        ? join(baseDir, args.branch)
        : join(repo.path, baseDir, args.branch);

      const jobId = randomUUID();
      bootstrapper.enqueue({
        jobId,
        repoId: repo.id,
        mainRepoPath: repo.path,
        branch: args.branch,
        baseBranch: cfg.value.config.worktree.defaultBaseBranch,
        worktreePath,
        filesToCopy: cfg.value.config.worktree.filesToCopy,
        installCommand: cfg.value.config.worktree.installCommand,
        initCommands: cfg.value.config.worktree.initCommands,
      });
      return ok({ jobId });
    }
  );

  ipcMain.handle(
    "newWorktree:retry",
    async (_e, args: IpcIn<"newWorktree:retry">): Promise<IpcOut<"newWorktree:retry">> => {
      bootstrapper.retry(args.jobId);
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "newWorktree:cancel",
    async (_e, args: IpcIn<"newWorktree:cancel">): Promise<IpcOut<"newWorktree:cancel">> => {
      bootstrapper.cancel(args.jobId);
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "newWorktree:list",
    async (_e, args: IpcIn<"newWorktree:list">): Promise<IpcOut<"newWorktree:list">> => {
      return ok({ jobs: bootstrapper.list(args.repoId) });
    }
  );
}
