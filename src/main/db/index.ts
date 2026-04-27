import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getDbPath } from "../paths";
import { runMigrations } from "./migrations";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  _db = db;
  return db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
