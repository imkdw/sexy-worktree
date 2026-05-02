import type { Result } from "./result";
import type { PaneNode } from "./pane";
import type { JobSnapshot, JobEvent } from "./newWorktree";

export type RepoRow = {
  id: number;
  path: string;
  name: string;
  lastActiveAt: number;
};

export type RepoValidationError =
  | { kind: "not-a-directory" }
  | { kind: "not-a-git-repo" }
  | { kind: "is-a-worktree"; mainRepoPath: string }
  | { kind: "unknown"; message: string };

export type Worktree = {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
};

export type WorktreeListError = { kind: "git-failed"; stderr: string };

export type ConfigError =
  | { kind: "invalid"; issues: string[] }
  | { kind: "unreadable"; message: string };

export type ConfigSaveError = ConfigError | { kind: "write-failed"; message: string };

export type RepoConfigDto = {
  version: 1;
  worktree: {
    baseDir: string;
    defaultBaseBranch: string;
    filesToCopy: string[];
    installCommand: string;
    initCommands: string[];
  };
  jira?: {
    enabled: boolean;
    workspaceUrl: string;
    email: string;
    tokenKeychainKey: string;
  };
  branchValidation?: { requireJiraPattern: boolean };
};

export type PtyId = string;

export type PtySpawnArgs = {
  cwd: string;
  cols: number;
  rows: number;
  shell?: string;
  env?: Record<string, string>;
};

export type PtyDataEvent = { id: PtyId; data: string };
export type PtyExitEvent = {
  id: PtyId;
  exitCode: number;
  signal: number | null;
  lastBytes: string;
};

export type PtySpawnError =
  | { kind: "cwd-missing"; cwd: string; message: string }
  | { kind: "unknown"; message: string };

export type IpcChannels = {
  "repo:openDialog": {
    in: void;
    out: Result<{ path: string } | null, never>;
  };
  "repo:validate": {
    in: { path: string };
    out: Result<{ name: string; canonicalPath: string }, RepoValidationError>;
  };
  "repo:add": {
    in: { path: string; name: string };
    out: Result<RepoRow, { message: string }>;
  };
  "repo:list": {
    in: void;
    out: Result<{ repos: RepoRow[]; activeRepoId: number | null }, never>;
  };
  "repo:setActive": {
    in: { id: number };
    out: Result<void, { message: string }>;
  };
  "repo:close": {
    in: { id: number };
    out: Result<void, { message: string }>;
  };
  "worktree:list": {
    in: { repoPath: string };
    out: Result<{ worktrees: Worktree[] }, WorktreeListError>;
  };
  "worktree:remove": {
    in: { repoPath: string; worktreePath: string };
    out: Result<void, { message: string }>;
  };
  "config:get": {
    in: { repoPath: string };
    out: Result<{ config: RepoConfigDto; source: "file" | "defaults" }, ConfigError>;
  };
  "config:saveJira": {
    in: {
      repoPath: string;
      jira: {
        enabled: true;
        workspaceUrl: string;
        email: string;
        tokenKeychainKey: string;
      };
    };
    out: Result<{ config: RepoConfigDto; configPath: string }, ConfigSaveError>;
  };
  "config:saveRepository": {
    in: {
      repoPath: string;
      config: RepoConfigDto;
    };
    out: Result<{ config: RepoConfigDto; configPath: string }, ConfigSaveError>;
  };
  "pty:spawn": {
    in: PtySpawnArgs;
    out: Result<{ id: PtyId }, PtySpawnError>;
  };
  "pty:write": {
    in: { id: PtyId; data: string };
    out: Result<void, { message: string }>;
  };
  "pty:resize": {
    in: { id: PtyId; cols: number; rows: number };
    out: Result<void, { message: string }>;
  };
  "pty:kill": {
    in: { id: PtyId };
    out: Result<void, { message: string }>;
  };
  "pane:load": {
    in: { repoId: number; worktreePath: string };
    out: Result<{ tree: PaneNode | null }, never>;
  };
  "pane:save": {
    in: { repoId: number; worktreePath: string; tree: PaneNode };
    out: Result<void, { message: string }>;
  };
  "newWorktree:create": {
    in: { repoId: number; branch: string };
    out: Result<
      { jobId: string },
      | { kind: "invalid-branch"; reason: string }
      | { kind: "duplicate"; existingPath: string }
      | { kind: "config"; message: string }
    >;
  };
  "newWorktree:retry": {
    in: { jobId: string };
    out: Result<void, { message: string }>;
  };
  "newWorktree:cancel": {
    in: { jobId: string };
    out: Result<void, { message: string }>;
  };
  "newWorktree:list": {
    in: { repoId: number };
    out: Result<{ jobs: JobSnapshot[] }, never>;
  };
  "secrets:get": {
    in: { key: string };
    out: Result<{ value: string | null }, { message: string }>;
  };
  "secrets:set": {
    in: { key: string; value: string };
    out: Result<void, { message: string }>;
  };
  "secrets:remove": {
    in: { key: string };
    out: Result<void, { message: string }>;
  };
  "jira:resolve": {
    in: { repoId: number; ticketInput: string };
    out: Result<
      { ticketKey: string; summary: string; suggestedBranch: string },
      {
        kind: "preflight" | "parse" | "auth" | "not-found" | "network" | "slug" | "unknown";
        message: string;
      }
    >;
  };
  "recents:list": {
    in: void;
    out: Result<{ recents: { path: string; name: string; lastOpenedAt: number }[] }, never>;
  };
};

export type IpcChannel = keyof IpcChannels;
export type IpcIn<C extends IpcChannel> = IpcChannels[C]["in"];
export type IpcOut<C extends IpcChannel> = IpcChannels[C]["out"];

export type NewWorktreeJobEvent = JobEvent;
