import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERVIEW_GRID_DENSITY,
  isOverviewGridDensity,
  nextOverviewGridDensity,
  parseOverviewGridDensity,
} from "@shared/overviewGridDensity";

describe("overview grid density helpers", () => {
  it("uses 2x2 as the default density", () => {
    expect(DEFAULT_OVERVIEW_GRID_DENSITY).toBe("2x2");
  });

  it("accepts only supported density values", () => {
    expect(isOverviewGridDensity("2x2")).toBe(true);
    expect(isOverviewGridDensity("3x3")).toBe(true);
    expect(isOverviewGridDensity("4x4")).toBe(false);
    expect(isOverviewGridDensity(null)).toBe(false);
  });

  it("parses invalid values as the default density", () => {
    expect(parseOverviewGridDensity("3x3")).toBe("3x3");
    expect(parseOverviewGridDensity("2x2")).toBe("2x2");
    expect(parseOverviewGridDensity("dense")).toBe("2x2");
    expect(parseOverviewGridDensity(undefined)).toBe("2x2");
  });

  it("toggles between 2x2 and 3x3", () => {
    expect(nextOverviewGridDensity("2x2")).toBe("3x3");
    expect(nextOverviewGridDensity("3x3")).toBe("2x2");
  });
});
