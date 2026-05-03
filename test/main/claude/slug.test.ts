import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { resolveClaudeBinaryPath } from "@main/claude/slug";

describe("resolveClaudeBinaryPath", () => {
  it("resolves the Claude executable from the installed package instead of the bundled output path", () => {
    const expectedPath = join(
      "/repo",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe"
    );
    const requireResolve = vi.fn((id: string) => {
      if (id !== "@anthropic-ai/claude-code/bin/claude.exe") {
        throw new Error(`unexpected package lookup: ${id}`);
      }
      return expectedPath;
    });

    const actualPath = resolveClaudeBinaryPath({ requireResolve });

    expect(actualPath).toBe(expectedPath);
    expect(actualPath).not.toBe(join("/repo", "out", "node_modules", ".bin", "claude"));
    expect(requireResolve).toHaveBeenCalledWith("@anthropic-ai/claude-code/bin/claude.exe");
  });
});
