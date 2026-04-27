import { describe, it, expect } from "vitest";
import { validateBranchName } from "./branchValidation";

describe("validateBranchName", () => {
  it("allows kebab-case names", () => {
    expect(validateBranchName("feat-add-search", { requireJiraPattern: false }).ok).toBe(true);
  });
  it("rejects empty", () => {
    expect(validateBranchName("", { requireJiraPattern: false })).toEqual({
      ok: false,
      reason: "branch-name-empty",
    });
  });
  it("rejects whitespace", () => {
    expect(validateBranchName("feat add", { requireJiraPattern: false }).ok).toBe(false);
  });
  it('rejects "/" or "..".', () => {
    expect(validateBranchName("feat/sub", { requireJiraPattern: false }).ok).toBe(false);
    expect(validateBranchName("foo..bar", { requireJiraPattern: false }).ok).toBe(false);
  });
  it("requires Jira pattern when configured", () => {
    expect(validateBranchName("feat-x", { requireJiraPattern: true }).ok).toBe(false);
    expect(validateBranchName("PROJ-123-feat-x", { requireJiraPattern: true }).ok).toBe(true);
  });
});
