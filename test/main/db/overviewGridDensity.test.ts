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
