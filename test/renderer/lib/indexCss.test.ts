/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("renderer index.css", () => {
  it("keeps the global button reset in the base layer so utility classes can override it", () => {
    const css = readFileSync(join(process.cwd(), "src/renderer/index.css"), "utf8");

    expect(css).toMatch(/@layer base\s*{\s*button\s*{[\s\S]*?}\s*}/);
  });
});
