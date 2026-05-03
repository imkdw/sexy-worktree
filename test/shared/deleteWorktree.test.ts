import { describe, expect, it } from "vitest";
import { isDeleteWorktreeJobTerminal } from "@shared/deleteWorktree";

describe("delete worktree job contracts", () => {
  it("identifies terminal job statuses", () => {
    expect(isDeleteWorktreeJobTerminal("running")).toBe(false);
    expect(isDeleteWorktreeJobTerminal("done")).toBe(true);
    expect(isDeleteWorktreeJobTerminal("failed")).toBe(true);
    expect(isDeleteWorktreeJobTerminal("cancelled")).toBe(true);
  });
});
