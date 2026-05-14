import { describe, expect, it } from "vitest";
import {
  findMarkdownPathLinks,
  resolveMarkdownRelativePath,
} from "@renderer/terminal/markdownPathLinks";

describe("terminal markdown path links", () => {
  it("finds relative markdown plan paths in terminal output", () => {
    const links = findMarkdownPathLinks(
      "Plan saved to docs/superpowers/plans/2026-05-14-ci-plan.md:12",
      "/repo"
    );

    expect(links).toEqual([
      {
        text: "docs/superpowers/plans/2026-05-14-ci-plan.md",
        relativePath: "docs/superpowers/plans/2026-05-14-ci-plan.md",
        startIndex: 14,
        endIndex: 58,
      },
    ]);
  });

  it("normalizes worktree-local absolute markdown paths", () => {
    expect(
      resolveMarkdownRelativePath(
        "/repo/docs/superpowers/plans/2026-05-14-ci-plan.md:3:1",
        "/repo"
      )
    ).toBe("docs/superpowers/plans/2026-05-14-ci-plan.md");
  });

  it("ignores external absolute paths and URL-like paths", () => {
    expect(resolveMarkdownRelativePath("/tmp/plan.md", "/repo")).toBeNull();
    expect(resolveMarkdownRelativePath("https://example.com/plan.md", "/repo")).toBeNull();
  });
});
