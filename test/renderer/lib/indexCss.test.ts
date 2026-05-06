/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function utilityBlock(css: string, utilityName: string): string {
  const match = css.match(new RegExp(`@utility ${utilityName} \\{([\\s\\S]*?)\\n\\}`));
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

function spacingDeductions(block: string): number {
  return block.match(/- var\(--spacing-3\)/g)?.length ?? 0;
}

describe("renderer index.css", () => {
  it("keeps the global button reset in the base layer so utility classes can override it", () => {
    const css = readFileSync(join(process.cwd(), "src/renderer/index.css"), "utf8");

    expect(css).toMatch(/@layer base\s*{\s*button\s*{[\s\S]*?}\s*}/);
  });

  it("defines explicit overview grid row utilities for 2x2 and 3x3 density", () => {
    const css = readFileSync(join(process.cwd(), "src/renderer/index.css"), "utf8");
    const rows2 = utilityBlock(css, "grid-card-rows-2");
    const rows3 = utilityBlock(css, "grid-card-rows-3");

    expect(rows2).toContain("/ 2");
    expect(spacingDeductions(rows2)).toBe(3);
    expect(rows3).toContain("/ 3");
    expect(spacingDeductions(rows3)).toBe(4);
  });
});
