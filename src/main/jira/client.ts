import { ok, err, type Result } from "@shared/result";

export type JiraError =
  | { kind: "auth"; status: number }
  | { kind: "not-found" }
  | { kind: "network"; message: string }
  | { kind: "unknown"; status: number; body: string };

export async function fetchJiraSummary(args: {
  workspaceUrl: string;
  email: string;
  apiToken: string;
  ticketKey: string;
}): Promise<Result<{ summary: string }, JiraError>> {
  const url = new URL(`/rest/api/3/issue/${encodeURIComponent(args.ticketKey)}`, args.workspaceUrl);
  const auth = Buffer.from(`${args.email}:${args.apiToken}`).toString("base64");
  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
  } catch (e) {
    return err({ kind: "network", message: (e as Error).message });
  }
  if (resp.status === 401 || resp.status === 403) return err({ kind: "auth", status: resp.status });
  if (resp.status === 404) return err({ kind: "not-found" });
  if (!resp.ok) return err({ kind: "unknown", status: resp.status, body: await resp.text() });
  const body = (await resp.json()) as { fields?: { summary?: string } };
  return ok({ summary: body.fields?.summary ?? "" });
}
