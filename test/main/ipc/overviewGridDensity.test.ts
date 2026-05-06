import { beforeEach, describe, expect, it, vi } from "vitest";

type IpcHandler = (_event: unknown, args: unknown) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  db: {},
  loadOverviewGridDensity: vi.fn(),
  saveOverviewGridDensity: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock("@main/db", () => ({
  getDb: vi.fn(() => mocks.db),
}));

vi.mock("@main/db/overviewGridDensity", () => ({
  loadOverviewGridDensity: mocks.loadOverviewGridDensity,
  saveOverviewGridDensity: mocks.saveOverviewGridDensity,
}));

async function setup() {
  vi.resetModules();
  mocks.handlers.clear();
  const module = await import("@main/ipc/overviewGridDensity");
  module.registerOverviewGridDensityHandlers();
}

function handler(channel: string): IpcHandler {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return registered;
}

describe("overview grid density IPC handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOverviewGridDensity.mockReturnValue("3x3");
  });

  it("loads density by repo id", async () => {
    await setup();

    await expect(handler("overviewGridDensity:get")(null, { repoId: 7 })).resolves.toEqual({
      ok: true,
      value: { density: "3x3" },
    });
    expect(mocks.loadOverviewGridDensity).toHaveBeenCalledWith(mocks.db, 7);
  });

  it("saves density by repo id", async () => {
    await setup();

    await expect(
      handler("overviewGridDensity:set")(null, { repoId: 7, density: "2x2" })
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(mocks.saveOverviewGridDensity).toHaveBeenCalledWith(mocks.db, 7, "2x2");
  });

  it("returns errors for malformed payloads", async () => {
    await setup();

    await expect(handler("overviewGridDensity:get")(null, { repoId: Number.NaN })).resolves.toEqual(
      { ok: false, error: { message: "Invalid overview grid density request" } }
    );
    await expect(
      handler("overviewGridDensity:set")(null, { repoId: 7, density: "4x4" })
    ).resolves.toEqual({
      ok: false,
      error: { message: "Invalid overview grid density request" },
    });
  });

  it("returns save errors without throwing", async () => {
    await setup();
    mocks.saveOverviewGridDensity.mockImplementation(() => {
      throw new Error("database is locked");
    });

    await expect(
      handler("overviewGridDensity:set")(null, { repoId: 7, density: "3x3" })
    ).resolves.toEqual({ ok: false, error: { message: "database is locked" } });
  });
});
