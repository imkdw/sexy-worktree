import type {
  IpcChannels,
  IpcIn,
  IpcOut,
  PtyDataEvent,
  PtyExitEvent,
  NewWorktreeJobEvent,
  WorktreeDeleteJobEvent,
  AppUpdateEvent,
} from "@shared/ipc";

type Invoker<C extends keyof IpcChannels> =
  IpcIn<C> extends void ? () => Promise<IpcOut<C>> : (input: IpcIn<C>) => Promise<IpcOut<C>>;

type Api = {
  dialog: {
    selectDirectory: Invoker<"dialog:selectDirectory">;
  };
  repo: {
    openDialog: Invoker<"repo:openDialog">;
    validate: Invoker<"repo:validate">;
    add: Invoker<"repo:add">;
    list: Invoker<"repo:list">;
    setActive: Invoker<"repo:setActive">;
    close: Invoker<"repo:close">;
  };
  update: {
    getState: Invoker<"update:getState">;
    check: Invoker<"update:check">;
    download: Invoker<"update:download">;
    openDownloaded: Invoker<"update:openDownloaded">;
    onEvent: (cb: (e: AppUpdateEvent) => void) => () => void;
  };
  worktree: {
    list: Invoker<"worktree:list">;
    files: Invoker<"worktree:files">;
    status: Invoker<"worktree:status">;
    readFile: Invoker<"worktree:readFile">;
    writeFile: Invoker<"worktree:writeFile">;
    fileDiff: Invoker<"worktree:fileDiff">;
    remove: Invoker<"worktree:remove">;
  };
  config: {
    get: Invoker<"config:get">;
    saveJira: Invoker<"config:saveJira">;
    saveRepository: Invoker<"config:saveRepository">;
  };
  pty: {
    spawn: Invoker<"pty:spawn">;
    write: Invoker<"pty:write">;
    resize: Invoker<"pty:resize">;
    kill: Invoker<"pty:kill">;
    onData: (cb: (e: PtyDataEvent) => void) => () => void;
    onExit: (cb: (e: PtyExitEvent) => void) => () => void;
  };
  pane: {
    load: Invoker<"pane:load">;
    save: Invoker<"pane:save">;
  };
  overviewGridDensity: {
    get: Invoker<"overviewGridDensity:get">;
    set: Invoker<"overviewGridDensity:set">;
  };
  newWorktree: {
    create: Invoker<"newWorktree:create">;
    retry: Invoker<"newWorktree:retry">;
    cancel: Invoker<"newWorktree:cancel">;
    list: Invoker<"newWorktree:list">;
    onEvent: (cb: (e: NewWorktreeJobEvent) => void) => () => void;
  };
  worktreeDelete: {
    start: Invoker<"worktreeDelete:start">;
    cancel: Invoker<"worktreeDelete:cancel">;
    dismiss: Invoker<"worktreeDelete:dismiss">;
    list: Invoker<"worktreeDelete:list">;
    onEvent: (cb: (e: WorktreeDeleteJobEvent) => void) => () => void;
  };
  secrets: {
    get: Invoker<"secrets:get">;
    set: Invoker<"secrets:set">;
    remove: Invoker<"secrets:remove">;
  };
  jira: {
    resolve: Invoker<"jira:resolve">;
  };
  recents: {
    list: Invoker<"recents:list">;
  };
};

declare global {
  interface Window {
    api: Api;
  }
}

export const api: Api = window.api;
