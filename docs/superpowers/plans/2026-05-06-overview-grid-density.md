# Overview Grid Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an overview-only toolbar toggle that switches the worktree grid between 2x2 and 3x3, persisted per repository in SQLite.

**Architecture:** Keep `mode.tsx` as `overview | focus` and add a separate overview grid density state provider. Persist density through typed IPC into the main-process SQLite database, then let `Toolbar` render the toggle and `Grid` choose explicit density classes. Terminal pane state stays owned by `TerminalSessionsProvider`.

**Tech Stack:** Electron main/preload IPC, better-sqlite3 migrations, React 19 context, TypeScript strict mode, Tailwind v4 utilities, lucide-react, Vitest.

**Project Rule:** Do not create branches or commits unless the user explicitly asks. This plan intentionally has verification checkpoints instead of commit steps.

---

## File Structure

- Create `src/shared/overviewGridDensity.ts`
  - Owns the serializable density type, default value, parser, and toggle helper shared across main and renderer.
- Modify `src/shared/ipc.ts`
  - Adds typed `overviewGridDensity:get` and `overviewGridDensity:set` channels.
- Modify `src/main/db/migrations.ts`
  - Appends migration v4 for `repo_ui_preferences`.
- Create `src/main/db/overviewGridDensity.ts`
  - Loads and saves density values in SQLite.
- Create `src/main/ipc/overviewGridDensity.ts`
  - Registers IPC handlers for load/save.
- Modify `src/main/ipc/index.ts`
  - Wires the new handler module.
- Modify `src/preload/index.ts`
  - Exposes the new IPC invokers under `window.api.overviewGridDensity`.
- Modify `src/renderer/ipc/api.ts`
  - Mirrors the preload API shape for renderer typing.
- Create `src/renderer/state/overviewGridDensity.tsx`
  - Loads active repo density, exposes `density`, `setDensity`, and `toggleDensity`, and handles save failures.
- Modify `src/renderer/App.tsx`
  - Adds `OverviewGridDensityProvider` and passes density props into `Toolbar`.
- Modify `src/renderer/chrome/Toolbar.tsx`
  - Adds the overview-only one-button density toggle after overview/focus.
- Modify `src/renderer/grid/Grid.tsx`
  - Uses density to choose `grid-cols-2/grid-card-rows-2` or `grid-cols-3/grid-card-rows-3`.
- Modify `src/renderer/index.css`
  - Replaces `grid-card-rows` with explicit `grid-card-rows-2` and `grid-card-rows-3`.
- Tests:
  - `test/shared/overviewGridDensity.test.ts`
  - `test/main/db/migrations.test.ts`
  - `test/main/db/overviewGridDensity.test.ts`
  - `test/main/ipc/overviewGridDensity.test.ts`
  - `test/renderer/state/overviewGridDensity.test.tsx`
  - `test/renderer/chrome/Toolbar.test.tsx`
  - `test/renderer/grid/Grid.test.tsx`
  - `test/renderer/lib/indexCss.test.ts`

---

### Task 1: Shared Density Contract

**Files:**

- Create: `src/shared/overviewGridDensity.ts`
- Create: `test/shared/overviewGridDensity.test.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Write the shared density tests**

Create `test/shared/overviewGridDensity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERVIEW_GRID_DENSITY,
  isOverviewGridDensity,
  nextOverviewGridDensity,
  parseOverviewGridDensity,
} from "@shared/overviewGridDensity";

describe("overview grid density helpers", () => {
  it("uses 2x2 as the default density", () => {
    expect(DEFAULT_OVERVIEW_GRID_DENSITY).toBe("2x2");
  });

  it("accepts only supported density values", () => {
    expect(isOverviewGridDensity("2x2")).toBe(true);
    expect(isOverviewGridDensity("3x3")).toBe(true);
    expect(isOverviewGridDensity("4x4")).toBe(false);
    expect(isOverviewGridDensity(null)).toBe(false);
  });

  it("parses invalid values as the default density", () => {
    expect(parseOverviewGridDensity("3x3")).toBe("3x3");
    expect(parseOverviewGridDensity("2x2")).toBe("2x2");
    expect(parseOverviewGridDensity("dense")).toBe("2x2");
    expect(parseOverviewGridDensity(undefined)).toBe("2x2");
  });

  it("toggles between 2x2 and 3x3", () => {
    expect(nextOverviewGridDensity("2x2")).toBe("3x3");
    expect(nextOverviewGridDensity("3x3")).toBe("2x2");
  });
});
```

- [ ] **Step 2: Run the shared test and confirm it fails**

Run:

```bash
pnpm vitest run test/shared/overviewGridDensity.test.ts
```

Expected: FAIL because `@shared/overviewGridDensity` does not exist.

- [ ] **Step 3: Add the shared density module**

Create `src/shared/overviewGridDensity.ts`:

```ts
export type OverviewGridDensity = "2x2" | "3x3";

export const DEFAULT_OVERVIEW_GRID_DENSITY: OverviewGridDensity = "2x2";

export function isOverviewGridDensity(value: unknown): value is OverviewGridDensity {
  return value === "2x2" || value === "3x3";
}

export function parseOverviewGridDensity(value: unknown): OverviewGridDensity {
  return isOverviewGridDensity(value) ? value : DEFAULT_OVERVIEW_GRID_DENSITY;
}

export function nextOverviewGridDensity(density: OverviewGridDensity): OverviewGridDensity {
  return density === "2x2" ? "3x3" : "2x2";
}
```

- [ ] **Step 4: Add IPC channel types**

In `src/shared/ipc.ts`, add the import near the existing imports:

```ts
import type { OverviewGridDensity } from "./overviewGridDensity";
```

Add this error type near the other exported IPC error types:

```ts
export type OverviewGridDensityError = { message: string };
```

Add these channels inside `IpcChannels`, after `pane:save` and before `newWorktree:create`:

```ts
  "overviewGridDensity:get": {
    in: { repoId: number };
    out: Result<{ density: OverviewGridDensity }, OverviewGridDensityError>;
  };
  "overviewGridDensity:set": {
    in: { repoId: number; density: OverviewGridDensity };
    out: Result<void, OverviewGridDensityError>;
  };
```

- [ ] **Step 5: Run the shared test again**

Run:

```bash
pnpm vitest run test/shared/overviewGridDensity.test.ts
```

Expected: PASS.

---

### Task 2: SQLite Persistence

**Files:**

- Modify: `src/main/db/migrations.ts`
- Create: `src/main/db/overviewGridDensity.ts`
- Modify: `test/main/db/migrations.test.ts`
- Create: `test/main/db/overviewGridDensity.test.ts`

- [ ] **Step 1: Add failing migration coverage**

In `test/main/db/migrations.test.ts`, add this test before the closing `});`:

```ts
it("creates the repo_ui_preferences table at v4", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repo_ui_preferences'")
    .get();
  expect(table).toBeTruthy();
});
```

- [ ] **Step 2: Add failing persistence tests**

Create `test/main/db/overviewGridDensity.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@main/db/migrations";
import { loadOverviewGridDensity, saveOverviewGridDensity } from "@main/db/overviewGridDensity";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  db.prepare("INSERT INTO repos(id, path, name, last_active_at) VALUES (?, ?, ?, ?)").run(
    1,
    "/repo",
    "repo",
    0
  );
});

describe("overview grid density persistence", () => {
  it("returns 2x2 when a repository has no stored preference", () => {
    expect(loadOverviewGridDensity(db, 1)).toBe("2x2");
  });

  it("saves and loads the repository density", () => {
    saveOverviewGridDensity(db, 1, "3x3");
    expect(loadOverviewGridDensity(db, 1)).toBe("3x3");

    saveOverviewGridDensity(db, 1, "2x2");
    expect(loadOverviewGridDensity(db, 1)).toBe("2x2");
  });

  it("falls back to 2x2 for invalid stored values", () => {
    db.pragma("ignore_check_constraints = ON");
    db.prepare(
      `INSERT INTO repo_ui_preferences (repo_id, overview_grid_density, updated_at)
       VALUES (?, ?, ?)`
    ).run(1, "invalid", 1);

    expect(loadOverviewGridDensity(db, 1)).toBe("2x2");
  });

  it("removes preferences when the repo row is deleted", () => {
    saveOverviewGridDensity(db, 1, "3x3");
    db.prepare("DELETE FROM repos WHERE id = ?").run(1);

    const row = db.prepare("SELECT repo_id FROM repo_ui_preferences WHERE repo_id = ?").get(1);
    expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run DB tests and confirm they fail**

Run:

```bash
pnpm vitest run test/main/db/migrations.test.ts test/main/db/overviewGridDensity.test.ts
```

Expected: FAIL because the table and DB module do not exist.

- [ ] **Step 4: Add migration v4**

In `src/main/db/migrations.ts`, append this object to `MIGRATIONS` after version 3:

```ts
  {
    version: 4,
    description: "repo UI preferences",
    up: (db) => {
      db.exec(`
        CREATE TABLE repo_ui_preferences (
          repo_id INTEGER PRIMARY KEY,
          overview_grid_density TEXT NOT NULL
            CHECK (overview_grid_density IN ('2x2', '3x3')),
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
        );
      `);
    },
  },
```

- [ ] **Step 5: Add DB persistence helpers**

Create `src/main/db/overviewGridDensity.ts`:

```ts
import type Database from "better-sqlite3";
import {
  DEFAULT_OVERVIEW_GRID_DENSITY,
  parseOverviewGridDensity,
  type OverviewGridDensity,
} from "@shared/overviewGridDensity";

export function loadOverviewGridDensity(
  db: Database.Database,
  repoId: number
): OverviewGridDensity {
  const row = db
    .prepare("SELECT overview_grid_density FROM repo_ui_preferences WHERE repo_id = ?")
    .get(repoId) as { overview_grid_density: string } | undefined;

  if (!row) return DEFAULT_OVERVIEW_GRID_DENSITY;
  return parseOverviewGridDensity(row.overview_grid_density);
}

export function saveOverviewGridDensity(
  db: Database.Database,
  repoId: number,
  density: OverviewGridDensity
): void {
  db.prepare(
    `INSERT INTO repo_ui_preferences (repo_id, overview_grid_density, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(repo_id) DO UPDATE SET
       overview_grid_density = excluded.overview_grid_density,
       updated_at = excluded.updated_at`
  ).run(repoId, density, Date.now());
}
```

- [ ] **Step 6: Run DB tests again**

Run:

```bash
pnpm vitest run test/main/db/migrations.test.ts test/main/db/overviewGridDensity.test.ts
```

Expected: PASS.

---

### Task 3: IPC Wiring

**Files:**

- Create: `src/main/ipc/overviewGridDensity.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/ipc/api.ts`
- Create: `test/main/ipc/overviewGridDensity.test.ts`

- [ ] **Step 1: Add failing IPC handler tests**

Create `test/main/ipc/overviewGridDensity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run IPC test and confirm it fails**

Run:

```bash
pnpm vitest run test/main/ipc/overviewGridDensity.test.ts
```

Expected: FAIL because `@main/ipc/overviewGridDensity` does not exist.

- [ ] **Step 3: Add IPC handlers**

Create `src/main/ipc/overviewGridDensity.ts`:

```ts
import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import { isOverviewGridDensity } from "@shared/overviewGridDensity";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { getDb } from "../db";
import { loadOverviewGridDensity, saveOverviewGridDensity } from "../db/overviewGridDensity";

function isRepoId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGetArgs(value: unknown): value is IpcIn<"overviewGridDensity:get"> {
  if (typeof value !== "object" || value === null) return false;
  return isRepoId((value as { repoId?: unknown }).repoId);
}

function isSetArgs(value: unknown): value is IpcIn<"overviewGridDensity:set"> {
  if (typeof value !== "object" || value === null) return false;
  const maybe = value as { repoId?: unknown; density?: unknown };
  return isRepoId(maybe.repoId) && isOverviewGridDensity(maybe.density);
}

const invalidRequest = { message: "Invalid overview grid density request" };

export function registerOverviewGridDensityHandlers(): void {
  ipcMain.handle(
    "overviewGridDensity:get",
    async (_e, args: unknown): Promise<IpcOut<"overviewGridDensity:get">> => {
      if (!isGetArgs(args)) return err(invalidRequest);
      try {
        return ok({ density: loadOverviewGridDensity(getDb(), args.repoId) });
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );

  ipcMain.handle(
    "overviewGridDensity:set",
    async (_e, args: unknown): Promise<IpcOut<"overviewGridDensity:set">> => {
      if (!isSetArgs(args)) return err(invalidRequest);
      try {
        saveOverviewGridDensity(getDb(), args.repoId, args.density);
        return ok(undefined);
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );
}
```

- [ ] **Step 4: Register the IPC handler**

In `src/main/ipc/index.ts`, add:

```ts
import { registerOverviewGridDensityHandlers } from "./overviewGridDensity";
```

Then call it after `registerPaneHandlers();`:

```ts
registerOverviewGridDensityHandlers();
```

- [ ] **Step 5: Expose the API in preload**

In `src/preload/index.ts`, add this block after `pane`:

```ts
  overviewGridDensity: {
    get: makeInvoker("overviewGridDensity:get"),
    set: makeInvoker("overviewGridDensity:set"),
  },
```

- [ ] **Step 6: Mirror the renderer API type**

In `src/renderer/ipc/api.ts`, add this block after `pane`:

```ts
overviewGridDensity: {
  get: Invoker<"overviewGridDensity:get">;
  set: Invoker<"overviewGridDensity:set">;
}
```

- [ ] **Step 7: Run IPC and type checks**

Run:

```bash
pnpm vitest run test/main/ipc/overviewGridDensity.test.ts
pnpm typecheck
```

Expected: both PASS.

---

### Task 4: Renderer Density Provider

**Files:**

- Create: `src/renderer/state/overviewGridDensity.tsx`
- Create: `test/renderer/state/overviewGridDensity.test.tsx`

- [ ] **Step 1: Add provider tests**

Create `test/renderer/state/overviewGridDensity.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/result";
import type { OverviewGridDensity } from "@shared/overviewGridDensity";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const activeRepoId = { current: 1 as number | null };
const toasts: Array<{ kind: string; title: string; description?: string; durationMs?: number }> =
  [];

function makeApi(): typeof window.api {
  return {
    dialog: {
      selectDirectory: vi.fn(),
    },
    repo: {
      openDialog: vi.fn(),
      validate: vi.fn(),
      add: vi.fn(),
      list: vi.fn(),
      setActive: vi.fn(),
      close: vi.fn(),
    },
    worktree: {
      list: vi.fn(),
      remove: vi.fn(),
    },
    config: {
      get: vi.fn(),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    pty: {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    pane: {
      load: vi.fn(),
      save: vi.fn(),
    },
    overviewGridDensity: {
      get: vi.fn().mockResolvedValue(ok({ density: "3x3" as OverviewGridDensity })),
      set: vi.fn().mockResolvedValue(ok(undefined)),
    },
    newWorktree: {
      create: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    worktreeDelete: {
      start: vi.fn(),
      cancel: vi.fn(),
      dismiss: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    secrets: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    jira: {
      resolve: vi.fn(),
    },
    recents: {
      list: vi.fn(),
    },
  } satisfies typeof window.api;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountProvider() {
  vi.resetModules();
  window.api = makeApi();
  toasts.length = 0;

  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: activeRepoId.current }),
  }));

  vi.doMock("@renderer/state/toast", () => ({
    useToast: () => ({
      push: (toast: { kind: string; title: string; description?: string; durationMs?: number }) => {
        toasts.push(toast);
        return "toast-1";
      },
    }),
  }));

  const module = await import("@renderer/state/overviewGridDensity");
  const latest: { value: ReturnType<typeof module.useOverviewGridDensity> | null } = {
    value: null,
  };

  function Probe(): null {
    latest.value = module.useOverviewGridDensity();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(module.OverviewGridDensityProvider, null, createElement(Probe)));
  });
  await flush();

  return {
    latest,
    api: window.api,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("OverviewGridDensityProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    activeRepoId.current = 1;
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/repos");
    vi.doUnmock("@renderer/state/toast");
    vi.restoreAllMocks();
  });

  it("loads density for the active repository", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.api.overviewGridDensity.get).toHaveBeenCalledWith({ repoId: 1 });
    expect(mounted.latest.value?.density).toBe("3x3");
  });

  it("defaults to 2x2 when there is no active repository", async () => {
    activeRepoId.current = null;
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.api.overviewGridDensity.get).not.toHaveBeenCalled();
    expect(mounted.latest.value?.density).toBe("2x2");
  });

  it("optimistically toggles and persists density", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      await mounted.latest.value?.toggleDensity();
    });

    expect(mounted.latest.value?.density).toBe("2x2");
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledWith({
      repoId: 1,
      density: "2x2",
    });
  });

  it("reverts and shows a toast when saving fails", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    vi.mocked(mounted.api.overviewGridDensity.set).mockResolvedValueOnce(
      err({ message: "database is locked" })
    );

    await act(async () => {
      await mounted.latest.value?.setDensity("2x2");
    });

    expect(mounted.latest.value?.density).toBe("3x3");
    expect(toasts).toEqual([
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "database is locked",
        durationMs: 5000,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run provider test and confirm it fails**

Run:

```bash
pnpm vitest run test/renderer/state/overviewGridDensity.test.tsx
```

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement the provider**

Create `src/renderer/state/overviewGridDensity.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_OVERVIEW_GRID_DENSITY,
  nextOverviewGridDensity,
  type OverviewGridDensity,
} from "@shared/overviewGridDensity";
import { api } from "../ipc/api";
import { useRepos } from "./repos";
import { useToast } from "./toast";

type State = {
  density: OverviewGridDensity;
  setDensity: (density: OverviewGridDensity) => Promise<void>;
  toggleDensity: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);

export function OverviewGridDensityProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const toast = useToast();
  const [densityByRepo, setDensityByRepo] = useState<Map<number, OverviewGridDensity>>(new Map());
  const activeRepoIdRef = useRef(activeRepoId);
  activeRepoIdRef.current = activeRepoId;

  useEffect(() => {
    if (activeRepoId == null) return;
    const repoId = activeRepoId;
    let cancelled = false;

    void api.overviewGridDensity.get({ repoId }).then((result) => {
      if (cancelled || activeRepoIdRef.current !== repoId) return;
      const next = result.ok ? result.value.density : DEFAULT_OVERVIEW_GRID_DENSITY;
      setDensityByRepo((prev) => {
        const copy = new Map(prev);
        copy.set(repoId, next);
        return copy;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeRepoId]);

  const density =
    activeRepoId == null
      ? DEFAULT_OVERVIEW_GRID_DENSITY
      : (densityByRepo.get(activeRepoId) ?? DEFAULT_OVERVIEW_GRID_DENSITY);

  const setDensity = useCallback(
    async (next: OverviewGridDensity): Promise<void> => {
      if (activeRepoId == null) return;
      const repoId = activeRepoId;
      const previous = densityByRepo.get(repoId) ?? DEFAULT_OVERVIEW_GRID_DENSITY;

      setDensityByRepo((prev) => {
        const copy = new Map(prev);
        copy.set(repoId, next);
        return copy;
      });

      const result = await api.overviewGridDensity.set({ repoId, density: next });
      if (result.ok) return;

      setDensityByRepo((prev) => {
        const copy = new Map(prev);
        copy.set(repoId, previous);
        return copy;
      });
      toast.push({
        kind: "error",
        title: "Failed to save overview layout",
        description: result.error.message,
        durationMs: 5000,
      });
    },
    [activeRepoId, densityByRepo, toast]
  );

  const toggleDensity = useCallback(async (): Promise<void> => {
    await setDensity(nextOverviewGridDensity(density));
  }, [density, setDensity]);

  const value = useMemo<State>(
    () => ({ density, setDensity, toggleDensity }),
    [density, setDensity, toggleDensity]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOverviewGridDensity(): State {
  const value = useContext(Ctx);
  if (!value)
    throw new Error("useOverviewGridDensity must be inside <OverviewGridDensityProvider>");
  return value;
}
```

- [ ] **Step 4: Run provider test again**

Run:

```bash
pnpm vitest run test/renderer/state/overviewGridDensity.test.tsx
```

Expected: PASS.

---

### Task 5: Toolbar Density Button

**Files:**

- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/chrome/Toolbar.tsx`
- Modify: `test/renderer/chrome/Toolbar.test.tsx`

- [ ] **Step 1: Add toolbar tests**

In `test/renderer/chrome/Toolbar.test.tsx`, update the `createElement(Toolbar, ...)` props in `mountToolbar()` to include:

```ts
          overviewGridDensity: "2x2",
          onToggleOverviewGridDensity: vi.fn(),
```

Add this helper near `mountToolbar()`:

```ts
async function mountToolbarWithProps(
  props: Partial<{
    mode: "overview" | "focus";
    overviewGridDensity: "2x2" | "3x3";
    onToggleOverviewGridDensity: () => void;
  }>
): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/selectMode", () => ({
    useSelectMode: () => ({
      enabled: false,
      selected: new Set<string>(),
      lastToggledId: null,
      enter: vi.fn(),
      exit: vi.fn(),
      toggle: vi.fn(),
      toggleRangeTo: vi.fn(),
      clearSelected: vi.fn(),
      selectAll: vi.fn(),
      toggleAll: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({
      worktreesByRepo: new Map(),
      worktrees,
      activeId: selectedWorktree,
      setActive: vi.fn(),
      refresh: vi.fn(),
      refreshRepo: vi.fn(),
    }),
  }));

  const [{ TooltipProvider }, { Toolbar }] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/chrome/Toolbar"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Toolbar, {
          repoPath: "/repo",
          worktreeCount: worktrees.length,
          mode: props.mode ?? "overview",
          overviewGridDensity: props.overviewGridDensity ?? "2x2",
          onToggleOverviewGridDensity: props.onToggleOverviewGridDensity ?? vi.fn(),
        })
      )
    );
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
```

Add these tests inside `describe("Toolbar", ...)`:

```ts
it("shows an overview density toggle in overview mode", async () => {
  const onToggle = vi.fn();
  const mounted = await mountToolbarWithProps({
    mode: "overview",
    overviewGridDensity: "2x2",
    onToggleOverviewGridDensity: onToggle,
  });
  cleanup = mounted.unmount;

  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Switch overview grid to 3x3"]'
  );
  expect(button).toBeTruthy();

  await act(async () => {
    button?.click();
  });
  expect(onToggle).toHaveBeenCalledTimes(1);
});

it("hides the overview density toggle in focus mode", async () => {
  const mounted = await mountToolbarWithProps({
    mode: "focus",
    overviewGridDensity: "3x3",
    onToggleOverviewGridDensity: vi.fn(),
  });
  cleanup = mounted.unmount;

  expect(document.querySelector('button[aria-label="Switch overview grid to 2x2"]')).toBeNull();
  expect(document.querySelector('button[aria-label="Switch overview grid to 3x3"]')).toBeNull();
});
```

- [ ] **Step 2: Run toolbar tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/chrome/Toolbar.test.tsx
```

Expected: FAIL because `Toolbar` has no density props or button.

- [ ] **Step 3: Add toolbar props and button**

In `src/renderer/chrome/Toolbar.tsx`, extend the lucide import:

```ts
import {
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  Maximize2,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
```

Add the shared type import:

```ts
import type { OverviewGridDensity } from "@shared/overviewGridDensity";
```

Extend `ToolbarProps`:

```ts
  overviewGridDensity?: OverviewGridDensity;
  onToggleOverviewGridDensity?: () => void;
```

Destructure the new props in `Toolbar(...)`.

Before the `return`, add:

```ts
const densityTarget = overviewGridDensity === "3x3" ? "2x2" : "3x3";
const DensityIcon = overviewGridDensity === "3x3" ? Grid3x3 : Grid2x2;
```

Inside the right-side `<div className="flex items-center gap-2">`, immediately after `</ToggleGroup.Root>` and before New Worktree, add:

```tsx
{
  mode === "overview" && overviewGridDensity && (
    <Tooltip label={`Switch to ${densityTarget}`}>
      <button
        aria-label={`Switch overview grid to ${densityTarget}`}
        className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150"
        onClick={onToggleOverviewGridDensity}
      >
        <Icon icon={DensityIcon} />
      </button>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Wire provider through App Shell**

In `src/renderer/App.tsx`, add:

```ts
import { OverviewGridDensityProvider, useOverviewGridDensity } from "./state/overviewGridDensity";
```

Inside `Shell()`, add:

```ts
const { density: overviewGridDensity, toggleDensity } = useOverviewGridDensity();
```

Pass these props to `Toolbar`:

```tsx
        overviewGridDensity={overviewGridDensity}
        onToggleOverviewGridDensity={() => void toggleDensity()}
```

Wrap the existing provider subtree inside `ReposProvider` with `OverviewGridDensityProvider`:

```tsx
<ReposProvider>
  <OverviewGridDensityProvider>
    <WorktreesProvider>
      <DeleteWorktreeProvider>
        <TerminalSessionsProvider>
          <NewWorktreeProvider>
            <SelectModeProvider>
              <ModeProvider>
                <Shell />
              </ModeProvider>
            </SelectModeProvider>
          </NewWorktreeProvider>
        </TerminalSessionsProvider>
      </DeleteWorktreeProvider>
    </WorktreesProvider>
  </OverviewGridDensityProvider>
</ReposProvider>
```

- [ ] **Step 5: Run toolbar and provider tests**

Run:

```bash
pnpm vitest run test/renderer/chrome/Toolbar.test.tsx test/renderer/state/overviewGridDensity.test.tsx
```

Expected: PASS.

---

### Task 6: Grid Density Layout

**Files:**

- Modify: `src/renderer/grid/Grid.tsx`
- Modify: `src/renderer/index.css`
- Create: `test/renderer/grid/Grid.test.tsx`
- Modify: `test/renderer/lib/indexCss.test.ts`

- [ ] **Step 1: Add grid tests**

Create `test/renderer/grid/Grid.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OverviewGridDensity } from "@shared/overviewGridDensity";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let density: OverviewGridDensity = "2x2";

async function mountGrid(): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: 1 }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: { path: string }) => wt.path,
    useWorktrees: () => ({
      worktrees: [
        { path: "/repo", branch: "main", head: "abc", isMain: true },
        { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
      ],
      activeId: "/repo",
      setActive: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/newWorktree", () => ({
    useNewWorktreeJobs: () => ({ jobs: [] }),
  }));
  vi.doMock("@renderer/state/overviewGridDensity", () => ({
    useOverviewGridDensity: () => ({ density }),
  }));
  vi.doMock("@renderer/card/Card", () => ({
    Card: ({ branch }: { branch: string }) => createElement("section", null, branch),
  }));
  vi.doMock("@renderer/card/ProvisioningCard", () => ({
    ProvisioningCard: () => createElement("section", null, "job"),
  }));

  const { Grid } = await import("@renderer/grid/Grid");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(Grid));
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Grid density layout", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    density = "2x2";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("uses 2-column classes for 2x2 density", async () => {
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    const grid = mounted.container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("grid-card-rows-2");
    expect(grid.className).not.toContain("grid-cols-3");
    expect(grid.className).not.toContain("grid-card-rows-3");
  });

  it("uses 3-column classes for 3x3 density", async () => {
    density = "3x3";
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    const grid = mounted.container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-3");
    expect(grid.className).toContain("grid-card-rows-3");
    expect(grid.className).not.toContain("grid-cols-2");
    expect(grid.className).not.toContain("grid-card-rows-2");
  });
});
```

- [ ] **Step 2: Add CSS utility test coverage**

In `test/renderer/lib/indexCss.test.ts`, add this test:

```ts
it("defines explicit overview grid row utilities for 2x2 and 3x3 density", () => {
  const css = readFileSync(join(process.cwd(), "src/renderer/index.css"), "utf8");

  expect(css).toContain("@utility grid-card-rows-2");
  expect(css).toContain("/ 2");
  expect(css).toContain("@utility grid-card-rows-3");
  expect(css).toContain("/ 3");
});
```

- [ ] **Step 3: Run grid tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/grid/Grid.test.tsx test/renderer/lib/indexCss.test.ts
```

Expected: FAIL because `Grid` still uses `grid-card-rows grid-cols-2` and CSS has no explicit density utilities.

- [ ] **Step 4: Add CSS utilities**

In `src/renderer/index.css`, replace:

```css
@utility grid-card-rows {
  grid-auto-rows: calc((100vh - var(--titlebar-h) - var(--tabbar-h) - var(--toolbar-h)) / 2);
}
```

With:

```css
@utility grid-card-rows-2 {
  grid-auto-rows: calc((100vh - var(--titlebar-h) - var(--tabbar-h) - var(--toolbar-h)) / 2);
}

@utility grid-card-rows-3 {
  grid-auto-rows: calc((100vh - var(--titlebar-h) - var(--tabbar-h) - var(--toolbar-h)) / 3);
}
```

- [ ] **Step 5: Update Grid to read density**

In `src/renderer/grid/Grid.tsx`, add imports:

```ts
import { cn } from "../lib/cn";
import { useOverviewGridDensity } from "../state/overviewGridDensity";
```

Inside `Grid()`, add:

```ts
const { density } = useOverviewGridDensity();
```

Before the final `return`, add:

```ts
const gridClass = cn(
  "grid gap-3 p-3",
  density === "2x2" ? "grid-card-rows-2 grid-cols-2" : "grid-card-rows-3 grid-cols-3"
);
```

Replace:

```tsx
    <div className="grid-card-rows grid grid-cols-2 gap-3 p-3">
```

With:

```tsx
    <div className={gridClass}>
```

- [ ] **Step 6: Run grid tests again**

Run:

```bash
pnpm vitest run test/renderer/grid/Grid.test.tsx test/renderer/lib/indexCss.test.ts
```

Expected: PASS.

---

### Task 7: Integration Verification

**Files:**

- Verify all files changed in previous tasks.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm vitest run \
  test/shared/overviewGridDensity.test.ts \
  test/main/db/migrations.test.ts \
  test/main/db/overviewGridDensity.test.ts \
  test/main/ipc/overviewGridDensity.test.ts \
  test/renderer/state/overviewGridDensity.test.tsx \
  test/renderer/chrome/Toolbar.test.tsx \
  test/renderer/grid/Grid.test.tsx \
  test/renderer/lib/indexCss.test.ts
```

Expected: PASS for all listed files.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. This command rebuilds `better-sqlite3` and `node-pty` before Vitest and rebuilds native modules for Electron afterward.

- [ ] **Step 4: Run the app for manual UI verification**

Run:

```bash
pnpm dev
```

Expected: Electron opens. In overview mode, verify:

- The density button appears immediately after overview/focus.
- The button is hidden in focus mode.
- Clicking the button switches between 2-column and 3-column grids.
- The chosen density persists after switching away from and back to the same repo.
- A different repo can keep a different density.
- Terminal panes remain mounted and do not reset when changing density.

- [ ] **Step 5: Review git status without committing**

Run:

```bash
git status --short
```

Expected: Only the planned source, test, spec, and plan files are changed. Do not commit unless the user explicitly asks.

---

## Self-Review Result

- [x] Spec coverage: overview-only density, toolbar placement, focus-mode hiding, SQLite repo preference, explicit row utilities, IPC typing, save failure fallback, and non-goals are all covered by tasks.
- [x] No implementation task asks for branch creation or commits.
- [x] No renderer code calls Node, Electron, or SQLite directly.
- [x] `mode.tsx` remains unchanged except for consumers using density separately.
- [x] Terminal card and `TerminalSessionsProvider` lifecycle code remain untouched.
- [x] All new renderer UI uses existing `Tooltip`, `Icon`, lucide icons, semantic token classes, and 32px toolbar hit targets.
