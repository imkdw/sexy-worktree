import type Database from "better-sqlite3";
import type { RepoRow } from "@shared/ipc";

export function upsertRepo(db: Database.Database, args: { path: string; name: string }): RepoRow {
  const now = Date.now();
  db.prepare(
    `INSERT INTO repos (path, name, last_active_at)
     VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET last_active_at = excluded.last_active_at`
  ).run(args.path, args.name, now);
  const row = db
    .prepare("SELECT id, path, name, last_active_at AS lastActiveAt FROM repos WHERE path = ?")
    .get(args.path) as RepoRow;
  return row;
}

export function listRepos(db: Database.Database): RepoRow[] {
  return db
    .prepare(
      "SELECT id, path, name, last_active_at AS lastActiveAt FROM repos ORDER BY last_active_at DESC"
    )
    .all() as RepoRow[];
}

export function getActiveRepoId(db: Database.Database): number | null {
  const row = db.prepare("SELECT value FROM app_state WHERE key = 'activeRepoId'").get() as
    | { value: string }
    | undefined;
  if (!row) return null;
  const id = Number(row.value);
  return Number.isFinite(id) ? id : null;
}

export function setActiveRepo(db: Database.Database, id: number): void {
  db.prepare(
    `INSERT INTO app_state (key, value) VALUES ('activeRepoId', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(id));
}

export function clearActiveRepo(db: Database.Database): void {
  db.prepare("DELETE FROM app_state WHERE key = 'activeRepoId'").run();
}

export function closeRepo(db: Database.Database, id: number): void {
  const active = getActiveRepoId(db);
  db.prepare("DELETE FROM repos WHERE id = ?").run(id);
  if (active === id) clearActiveRepo(db);
}
