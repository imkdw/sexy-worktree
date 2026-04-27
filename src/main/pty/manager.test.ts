import { describe, it, expect, afterEach } from "vitest";
import { PtyManager } from "./manager";

const m = new PtyManager();
afterEach(() => m.killAll());

describe("PtyManager", () => {
  it("spawns a shell and echoes input back", async () => {
    const id = m.spawn({
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      shell: "/bin/sh",
      env: { PS1: "$ " },
    });
    const chunks: string[] = [];
    m.onData(id, (d) => chunks.push(d));
    m.write(id, "echo hello-pty\n");
    await new Promise((r) => setTimeout(r, 300));
    expect(chunks.join("")).toMatch(/hello-pty/);
  });

  it("reports exit and removes the entry", async () => {
    const id = m.spawn({ cwd: process.cwd(), cols: 80, rows: 24, shell: "/bin/sh" });
    const exits: number[] = [];
    m.onExit(id, (code) => exits.push(code));
    m.write(id, "exit 0\n");
    await new Promise((r) => setTimeout(r, 300));
    expect(exits).toEqual([0]);
    expect(m.has(id)).toBe(false);
  });
});
