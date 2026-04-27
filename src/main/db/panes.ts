import type Database from "better-sqlite3";
import type { PaneNode } from "@shared/pane";

export function savePaneTree(
  db: Database.Database,
  repoId: number,
  worktreePath: string,
  tree: PaneNode
): void {
  db.prepare(
    `INSERT INTO pane_layouts (repo_id, worktree_path, tree_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_id, worktree_path) DO UPDATE SET
       tree_json = excluded.tree_json,
       updated_at = excluded.updated_at`
  ).run(repoId, worktreePath, JSON.stringify(tree), Date.now());
}

export function loadPaneTree(
  db: Database.Database,
  repoId: number,
  worktreePath: string
): PaneNode | null {
  const row = db
    .prepare("SELECT tree_json FROM pane_layouts WHERE repo_id = ? AND worktree_path = ?")
    .get(repoId, worktreePath) as { tree_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.tree_json) as PaneNode;
  } catch {
    return null;
  }
}
