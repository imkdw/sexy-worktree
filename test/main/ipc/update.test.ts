import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { ok } from "@shared/result";
import type { AppUpdateEvent } from "@shared/ipc";
import type { UpdateState } from "@shared/update";

type IpcHandler = (_event: unknown, args?: unknown) => Promise<unknown>;
type UpdateListener = (event: AppUpdateEvent) => void;

const idleState: UpdateState = { phase: "idle" };

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  listeners: [] as UpdateListener[],
  updateManager: {
    getState: vi.fn(),
    check: vi.fn(),
    download: vi.fn(),
    openDownloaded: vi.fn(),
    onEvent: vi.fn((listener: UpdateListener) => {
      mocks.listeners.push(listener);
      return () => {
        mocks.listeners = mocks.listeners.filter((current) => current !== listener);
      };
    }),
    emit: (event: AppUpdateEvent): void => {
      for (const listener of mocks.listeners) listener(event);
    },
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      if (mocks.handlers.has(channel)) throw new Error(`Duplicate IPC handler: ${channel}`);
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock("@main/update/manager", () => ({
  updateManager: mocks.updateManager,
}));

async function setup(getWindow: () => BrowserWindow | null = () => null) {
  vi.resetModules();
  mocks.handlers.clear();
  mocks.listeners.length = 0;
  const module = await import("@main/ipc/update");
  module.registerUpdateHandlers(getWindow);
  return { manager: mocks.updateManager, module };
}

function handler(channel: string): IpcHandler {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return registered;
}

describe("update IPC handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateManager.getState.mockReturnValue(idleState);
    mocks.updateManager.check.mockResolvedValue(ok({ state: idleState }));
    mocks.updateManager.download.mockResolvedValue(ok({ state: idleState }));
    mocks.updateManager.openDownloaded.mockResolvedValue(ok({ state: idleState }));
  });

  it("registers handlers and returns manager state", async () => {
    const { manager } = await setup();

    await expect(handler("update:getState")(null)).resolves.toEqual(ok({ state: idleState }));
    expect(manager.getState).toHaveBeenCalledWith();

    await expect(handler("update:check")(null)).resolves.toEqual(ok({ state: idleState }));
    expect(manager.check).toHaveBeenCalledWith({ silent: false });

    await expect(handler("update:download")(null)).resolves.toEqual(ok({ state: idleState }));
    expect(manager.download).toHaveBeenCalledWith();

    await expect(handler("update:openDownloaded")(null)).resolves.toEqual(ok({ state: idleState }));
    expect(manager.openDownloaded).toHaveBeenCalledWith();
  });

  it("forwards update events to current BrowserWindow", async () => {
    const send = vi.fn();
    const window = {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => false), send },
    } as unknown as BrowserWindow;
    const { manager } = await setup(() => window);

    manager.emit({ state: idleState });

    expect(send).toHaveBeenCalledWith("update:event", { state: idleState });
  });

  it("does not register duplicate handlers or listeners and uses the latest window getter", async () => {
    const firstSend = vi.fn();
    const secondSend = vi.fn();
    const firstWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => false), send: firstSend },
    } as unknown as BrowserWindow;
    const secondWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => false), send: secondSend },
    } as unknown as BrowserWindow;
    const { manager, module } = await setup(() => firstWindow);

    expect(() => module.registerUpdateHandlers(() => secondWindow)).not.toThrow();
    manager.emit({ state: idleState });

    expect(mocks.handlers.size).toBe(4);
    expect(manager.onEvent).toHaveBeenCalledTimes(1);
    expect(mocks.listeners).toHaveLength(1);
    expect(firstSend).not.toHaveBeenCalled();
    expect(secondSend).toHaveBeenCalledWith("update:event", { state: idleState });
  });

  it("does not send update events to destroyed windows", async () => {
    const send = vi.fn();
    const window = {
      isDestroyed: vi.fn(() => true),
      webContents: { isDestroyed: vi.fn(() => false), send },
    } as unknown as BrowserWindow;
    const { manager } = await setup(() => window);

    manager.emit({ state: idleState });

    expect(send).not.toHaveBeenCalled();
  });

  it("does not send update events to destroyed webContents", async () => {
    const send = vi.fn();
    const window = {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => true), send },
    } as unknown as BrowserWindow;
    const { manager } = await setup(() => window);

    manager.emit({ state: idleState });

    expect(send).not.toHaveBeenCalled();
  });

  it("does not throw when no window exists", async () => {
    const { manager } = await setup(() => null);

    expect(() => manager.emit({ state: idleState })).not.toThrow();
  });
});
