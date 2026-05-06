import type Database from "better-sqlite3";
import {
  DEFAULT_OVERVIEW_GRID_DENSITY,
  parseOverviewGridDensity,
  type OverviewGridDensity,
} from "@shared/overviewGridDensity";

export function loadOverviewGridDensity(
  db: Database.Database,
  repoId: number
): OverviewGridDensity {
  const row = db
    .prepare("SELECT overview_grid_density FROM repo_ui_preferences WHERE repo_id = ?")
    .get(repoId) as { overview_grid_density: string } | undefined;

  if (!row) return DEFAULT_OVERVIEW_GRID_DENSITY;
  return parseOverviewGridDensity(row.overview_grid_density);
}

export function saveOverviewGridDensity(
  db: Database.Database,
  repoId: number,
  density: OverviewGridDensity
): void {
  db.prepare(
    `INSERT INTO repo_ui_preferences (repo_id, overview_grid_density, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(repo_id) DO UPDATE SET
       overview_grid_density = excluded.overview_grid_density,
       updated_at = excluded.updated_at`
  ).run(repoId, density, Date.now());
}
