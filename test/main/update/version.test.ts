import { describe, expect, it } from "vitest";
import { compareVersions, isVersionGreater, parseVersion } from "@main/update/version";

describe("update version helpers", () => {
  it("parses plain and v-prefixed versions", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, version: "1.2.3" });
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, version: "1.2.3" });
  });

  it("normalizes versions with prerelease and build metadata suffixes", () => {
    expect(parseVersion("v1.2.3-beta.1+build.5")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      version: "1.2.3",
    });
  });

  it("rejects malformed versions", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("v1.2")).toBeNull();
    expect(parseVersion("v1.2.x")).toBeNull();
  });

  it("compares major, minor, then patch", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("reports whether a candidate is greater than the current app version", () => {
    expect(isVersionGreater("v1.0.1", "1.0.0")).toBe(true);
    expect(isVersionGreater("v1.0.0", "1.0.0")).toBe(false);
    expect(isVersionGreater("v0.9.9", "1.0.0")).toBe(false);
  });
});
