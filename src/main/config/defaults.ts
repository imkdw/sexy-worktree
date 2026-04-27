import type { RepoConfig } from "./schema";

export const DEFAULT_CONFIG: RepoConfig = {
  version: 1,
  worktree: {
    baseDir: "../worktrees",
    defaultBaseBranch: "main",
    filesToCopy: [],
    installCommand: 'echo "no install command configured"',
    initCommands: [],
    defaultStartupCommand: "",
  },
};
