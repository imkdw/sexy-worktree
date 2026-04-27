import { ipcMain } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { listRepos } from "../db/repos";
import { getDb } from "../db";
import { loadRepoConfig } from "../config/load";
import { keychain } from "./secrets";
import { parseJiraTicket } from "../jira/parseTicket";
import { fetchJiraSummary } from "../jira/client";
import { generateBranchSlug } from "../claude/slug";

export function registerJiraHandlers(): void {
  ipcMain.handle(
    "jira:resolve",
    async (_e, args: IpcIn<"jira:resolve">): Promise<IpcOut<"jira:resolve">> => {
      const repo = listRepos(getDb()).find((r) => r.id === args.repoId);
      if (!repo) return err({ kind: "unknown", message: "repo not found" });
      const cfg = await loadRepoConfig(repo.path);
      if (!cfg.ok || !cfg.value.config.jira?.enabled)
        return err({ kind: "preflight", message: "jira not configured" });
      const jiraCfg = cfg.value.config.jira;

      const parsed = parseJiraTicket(args.ticketInput);
      if (!parsed) return err({ kind: "parse", message: "cannot parse ticket" });

      const apiToken = await keychain.get(jiraCfg.tokenKeychainKey);
      if (!apiToken) return err({ kind: "preflight", message: "token missing in keychain" });

      const summaryR = await fetchJiraSummary({
        workspaceUrl: jiraCfg.workspaceUrl,
        email: jiraCfg.email,
        apiToken,
        ticketKey: parsed.key,
      });
      if (!summaryR.ok) {
        const k = summaryR.error.kind;
        if (k === "auth") return err({ kind: "auth", message: "invalid Jira credentials" });
        if (k === "not-found") return err({ kind: "not-found", message: "ticket not found" });
        if (k === "network") return err({ kind: "network", message: summaryR.error.message });
        return err({ kind: "unknown", message: "jira call failed" });
      }

      const slugR = await generateBranchSlug({
        ticketKey: parsed.key,
        summary: summaryR.value.summary,
      });
      if (!slugR.ok) return err({ kind: "slug", message: slugR.error.message });

      return ok({
        ticketKey: parsed.key,
        summary: summaryR.value.summary,
        suggestedBranch: `${parsed.key}-${slugR.value.slug}`,
      });
    }
  );
}
