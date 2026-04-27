import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations";
import { upsertRepo, listRepos, setActiveRepo, getActiveRepoId, closeRepo } from "./repos";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

describe("repos table", () => {
  it("upsert inserts on first call, updates last_active_at on second", () => {
    const a = upsertRepo(db, { path: "/x", name: "x" });
    const b = upsertRepo(db, { path: "/x", name: "x" });
    expect(a.id).toBe(b.id);
    expect(b.lastActiveAt).toBeGreaterThanOrEqual(a.lastActiveAt);
  });

  it("listRepos returns rows ordered by last_active_at desc", () => {
    upsertRepo(db, { path: "/a", name: "a" });
    upsertRepo(db, { path: "/b", name: "b" });
    upsertRepo(db, { path: "/a", name: "a" });
    const rows = listRepos(db);
    expect(rows.map((r) => r.path)).toEqual(["/a", "/b"]);
  });

  it("setActiveRepo / getActiveRepoId round-trip", () => {
    const r = upsertRepo(db, { path: "/y", name: "y" });
    setActiveRepo(db, r.id);
    expect(getActiveRepoId(db)).toBe(r.id);
  });

  it("closeRepo removes the row and clears active if it was active", () => {
    const r = upsertRepo(db, { path: "/z", name: "z" });
    setActiveRepo(db, r.id);
    closeRepo(db, r.id);
    expect(listRepos(db)).toHaveLength(0);
    expect(getActiveRepoId(db)).toBeNull();
  });
});
