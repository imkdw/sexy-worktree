import type { BrowserWindow } from "electron";
import { registerRepoHandlers } from "./repo";
import { registerWorktreeHandlers } from "./worktree";
import { registerConfigHandlers } from "./config";
import { registerPtyHandlers } from "./pty";
import { registerPaneHandlers } from "./pane";
import { registerNewWorktreeHandlers } from "./newWorktree";
import { registerSecretsHandlers } from "./secrets";
import { registerJiraHandlers } from "./jira";
import { registerWorktreeDeleteHandlers } from "./worktreeDelete";
import { registerRecentsHandlers } from "./recents";

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  registerRepoHandlers(getWindow);
  registerWorktreeHandlers();
  registerWorktreeDeleteHandlers();
  registerConfigHandlers();
  registerPtyHandlers(getWindow);
  registerPaneHandlers();
  registerNewWorktreeHandlers(getWindow);
  registerSecretsHandlers();
  registerJiraHandlers();
  registerRecentsHandlers();
}
