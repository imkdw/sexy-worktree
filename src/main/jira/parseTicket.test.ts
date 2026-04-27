import { describe, it, expect } from "vitest";
import { parseJiraTicket } from "./parseTicket";

describe("parseJiraTicket", () => {
  it("parses a bare key", () => {
    expect(parseJiraTicket("PROJ-123")).toEqual({ key: "PROJ-123" });
  });
  it("parses an Atlassian URL", () => {
    expect(parseJiraTicket("https://pgmworks.atlassian.net/browse/PROJ-123")).toEqual({
      key: "PROJ-123",
    });
  });
  it("parses a URL with extra query", () => {
    expect(parseJiraTicket("https://pgmworks.atlassian.net/browse/PROJ-123?focusedId=42")).toEqual({
      key: "PROJ-123",
    });
  });
  it("returns null for invalid input", () => {
    expect(parseJiraTicket("hello")).toBeNull();
  });
});
