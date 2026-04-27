import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, MIGRATIONS } from "./migrations";

describe("runMigrations", () => {
  it("creates the user_version table and applies all migrations", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const version = db.pragma("user_version", { simple: true }) as number;
    expect(version).toBe(MIGRATIONS.length);
  });

  it("is idempotent — running twice has no effect", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const v1 = db.pragma("user_version", { simple: true });
    runMigrations(db);
    const v2 = db.pragma("user_version", { simple: true });
    expect(v1).toBe(v2);
  });

  it("creates the repos table", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repos'")
      .get();
    expect(table).toBeTruthy();
  });

  it("creates the pane_layouts table at v2", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pane_layouts'")
      .get();
    expect(table).toBeTruthy();
  });

  it("creates the recents table at v3", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recents'")
      .get();
    expect(table).toBeTruthy();
  });
});
