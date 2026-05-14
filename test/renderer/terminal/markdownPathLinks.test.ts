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

  it("keeps extended markdown extensions intact", () => {
    expect(
      findMarkdownPathLinks("Preview docs/guide.mdx and docs/archive.markdown", "/repo")
    ).toEqual([
      {
        text: "docs/guide.mdx",
        relativePath: "docs/guide.mdx",
        startIndex: 8,
        endIndex: 22,
      },
      {
        text: "docs/archive.markdown",
        relativePath: "docs/archive.markdown",
        startIndex: 27,
        endIndex: 48,
      },
    ]);
  });

  it("ignores external absolute paths and URL-like paths", () => {
    expect(resolveMarkdownRelativePath("/tmp/plan.md", "/repo")).toBeNull();
    expect(resolveMarkdownRelativePath("https://example.com/plan.md", "/repo")).toBeNull();
  });
});
