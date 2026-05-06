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

  it("resolves the copied Electron resource binary before package lookup in packaged apps", () => {
    const resourcesPath = join("/Applications", "Sexy Worktree.app", "Contents", "Resources");
    const expectedPath = join(resourcesPath, "claude-code", "bin", "claude.exe");
    const existsSync = vi.fn((path: string) => path === expectedPath);
    const requireResolve = vi.fn(() => {
      throw new Error("Cannot find module '@anthropic-ai/claude-code/bin/claude.exe'");
    });

    const actualPath = resolveClaudeBinaryPath({
      existsSync,
      isPackaged: true,
      requireResolve,
      resourcesPath,
    });

    expect(actualPath).toBe(expectedPath);
    expect(existsSync).toHaveBeenCalledWith(expectedPath);
    expect(requireResolve).not.toHaveBeenCalled();
  });
});
