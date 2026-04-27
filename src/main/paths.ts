import { app } from "electron";
import { join } from "node:path";

export function getUserDataDir(): string {
  return app.getPath("userData");
}

export function getDbPath(): string {
  return join(getUserDataDir(), "state.db");
}
