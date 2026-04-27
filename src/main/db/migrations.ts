import type Database from "better-sqlite3";

export type Migration = {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "create repos table",
    up: (db) => {
      db.exec(`
        CREATE TABLE repos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          last_active_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE app_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    description: "pane layout per (repoId, worktreePath)",
    up: (db) => {
      db.exec(`
        CREATE TABLE pane_layouts (
          repo_id INTEGER NOT NULL,
          worktree_path TEXT NOT NULL,
          tree_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (repo_id, worktree_path),
          FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    version: 3,
    description: "recents table for empty-state suggestions",
    up: (db) => {
      db.exec(`
        CREATE TABLE recents (
          path TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_opened_at INTEGER NOT NULL
        );
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}
