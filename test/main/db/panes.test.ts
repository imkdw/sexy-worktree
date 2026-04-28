import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@main/db/migrations";
import { savePaneTree, loadPaneTree } from "@main/db/panes";
import { newLeaf } from "@shared/pane";

describe("panes table", () => {
  it("saves and loads a pane tree", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare("INSERT INTO repos(id, path, name, last_active_at) VALUES (?, ?, ?, ?)").run(
      1,
      "/x",
      "x",
      0
    );
    const tree = newLeaf("p1", "yarn dev");
    savePaneTree(db, 1, "/x/wt", tree);
    const loaded = loadPaneTree(db, 1, "/x/wt");
    expect(loaded).toEqual(tree);
  });

  it("returns null for missing rows", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    expect(loadPaneTree(db, 1, "/none")).toBeNull();
  });
});
