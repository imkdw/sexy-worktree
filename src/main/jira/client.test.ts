import { describe, it, expect, vi } from "vitest";
import { fetchJiraSummary } from "./client";

const okResp = (body: any) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

const errResp = (status: number, body = "") =>
  ({
    ok: false,
    status,
    text: async () => body,
  }) as unknown as Response;

describe("fetchJiraSummary", () => {
  it("returns the ticket summary on success", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(okResp({ fields: { summary: "Add user search" } }));
    const r = await fetchJiraSummary({
      workspaceUrl: "https://x.atlassian.net",
      email: "a@b",
      apiToken: "tok",
      ticketKey: "PROJ-123",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.summary).toBe("Add user search");
  });

  it("reports auth failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(errResp(401, "unauthorized"));
    const r = await fetchJiraSummary({
      workspaceUrl: "https://x.atlassian.net",
      email: "a@b",
      apiToken: "tok",
      ticketKey: "PROJ-123",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("auth");
  });

  it("reports not-found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(errResp(404, "not found"));
    const r = await fetchJiraSummary({
      workspaceUrl: "https://x.atlassian.net",
      email: "a@b",
      apiToken: "tok",
      ticketKey: "PROJ-999",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("not-found");
  });
});
