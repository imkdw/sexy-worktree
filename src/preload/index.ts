import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  IpcChannels,
  IpcIn,
  IpcOut,
  PtyDataEvent,
  PtyExitEvent,
  NewWorktreeJobEvent,
} from "@shared/ipc";

function makeInvoker<C extends keyof IpcChannels>(channel: C) {
  return (input?: IpcIn<C>): Promise<IpcOut<C>> => ipcRenderer.invoke(channel, input);
}

const api = {
  repo: {
    openDialog: makeInvoker("repo:openDialog"),
    validate: makeInvoker("repo:validate"),
    add: makeInvoker("repo:add"),
    list: makeInvoker("repo:list"),
    setActive: makeInvoker("repo:setActive"),
    close: makeInvoker("repo:close"),
  },
  worktree: {
    list: makeInvoker("worktree:list"),
    remove: makeInvoker("worktree:remove"),
  },
  config: { get: makeInvoker("config:get") },
  pty: {
    spawn: makeInvoker("pty:spawn"),
    write: makeInvoker("pty:write"),
    resize: makeInvoker("pty:resize"),
    kill: makeInvoker("pty:kill"),
    onData: (cb: (e: PtyDataEvent) => void) => {
      const fn = (_e: IpcRendererEvent, data: PtyDataEvent): void => cb(data);
      ipcRenderer.on("pty:data", fn);
      return () => ipcRenderer.off("pty:data", fn);
    },
    onExit: (cb: (e: PtyExitEvent) => void) => {
      const fn = (_e: IpcRendererEvent, data: PtyExitEvent): void => cb(data);
      ipcRenderer.on("pty:exit", fn);
      return () => ipcRenderer.off("pty:exit", fn);
    },
  },
  pane: {
    load: makeInvoker("pane:load"),
    save: makeInvoker("pane:save"),
  },
  newWorktree: {
    create: makeInvoker("newWorktree:create"),
    retry: makeInvoker("newWorktree:retry"),
    cancel: makeInvoker("newWorktree:cancel"),
    list: makeInvoker("newWorktree:list"),
    onEvent: (cb: (e: NewWorktreeJobEvent) => void) => {
      const fn = (_e: IpcRendererEvent, data: NewWorktreeJobEvent): void => cb(data);
      ipcRenderer.on("newWorktree:event", fn);
      return () => ipcRenderer.off("newWorktree:event", fn);
    },
  },
  secrets: {
    get: makeInvoker("secrets:get"),
    set: makeInvoker("secrets:set"),
    remove: makeInvoker("secrets:remove"),
  },
  jira: {
    resolve: makeInvoker("jira:resolve"),
  },
  recents: {
    list: makeInvoker("recents:list"),
  },
};

contextBridge.exposeInMainWorld("api", api);
export type Api = typeof api;
