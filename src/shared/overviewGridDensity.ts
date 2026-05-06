export type OverviewGridDensity = "2x2" | "3x3";

export const DEFAULT_OVERVIEW_GRID_DENSITY: OverviewGridDensity = "2x2";

export function isOverviewGridDensity(value: unknown): value is OverviewGridDensity {
  return value === "2x2" || value === "3x3";
}

export function parseOverviewGridDensity(value: unknown): OverviewGridDensity {
  return isOverviewGridDensity(value) ? value : DEFAULT_OVERVIEW_GRID_DENSITY;
}

export function nextOverviewGridDensity(density: OverviewGridDensity): OverviewGridDensity {
  return density === "2x2" ? "3x3" : "2x2";
}
