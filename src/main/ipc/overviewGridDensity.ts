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
