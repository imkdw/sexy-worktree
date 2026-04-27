import type Database from "better-sqlite3";

export type RecentRow = { path: string; name: string; lastOpenedAt: number };

export function addRecent(db: Database.Database, args: { path: string; name: string }): void {
  db.prepare(
    `INSERT INTO recents (path, name, last_opened_at)
     VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       name = excluded.name,
       last_opened_at = excluded.last_opened_at`
  ).run(args.path, args.name, Date.now());
}

export function listRecents(db: Database.Database, limit = 5): RecentRow[] {
  return db
    .prepare(
      "SELECT path, name, last_opened_at AS lastOpenedAt FROM recents ORDER BY last_opened_at DESC LIMIT ?"
    )
    .all(limit) as RecentRow[];
}
