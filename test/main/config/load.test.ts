import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRepoConfig } from "@main/config/load";
import { DEFAULT_CONFIG } from "@main/config/defaults";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "sw-cfg-"));
});

describe("loadRepoConfig", () => {
  it("returns defaults if file missing", async () => {
    const r = await loadRepoConfig(tmp);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.config).toEqual(DEFAULT_CONFIG);
    if (r.ok) expect(r.value.source).toBe("defaults");
  });

  it("returns parsed config if file present and valid", async () => {
    mkdirSync(join(tmp, ".sexyworktree"));
    writeFileSync(
      join(tmp, ".sexyworktree/config.json"),
      JSON.stringify({
        version: 1,
        worktree: {
          baseDir: "../wt",
          defaultBaseBranch: "develop",
          filesToCopy: [".env.local"],
          installCommand: "pnpm install",
          initCommands: ["pnpm build"],
        },
      })
    );
    const r = await loadRepoConfig(tmp);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.source).toBe("file");
      expect(r.value.config.worktree.installCommand).toBe("pnpm install");
    }
  });

  it("returns error envelope if file invalid", async () => {
    mkdirSync(join(tmp, ".sexyworktree"));
    writeFileSync(join(tmp, ".sexyworktree/config.json"), '{"version": 99}');
    const r = await loadRepoConfig(tmp);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid");
  });
});
