import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { PreflightNotice } from "./PreflightNotice";
import { validateBranchName } from "@shared/branchValidation";
import { Tooltip } from "../ui";

type Props = {
  busy: boolean;
  requireJiraPattern: boolean;
  onSubmit: (branch: string) => Promise<void>;
  onOpenSettings: () => void;
};

export function JiraTab({
  busy,
  requireJiraPattern,
  onSubmit,
  onOpenSettings,
}: Props): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const [jiraEnabled, setJiraEnabled] = useState<boolean | null>(null);
  const [tokenPresent, setTokenPresent] = useState<boolean | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [resolved, setResolved] = useState<{
    ticketKey: string;
    summary: string;
    branch: string;
  } | null>(null);
  const [editingBranch, setEditingBranch] = useState(false);
  const [draftBranch, setDraftBranch] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!activeRepoId) return;
    void (async () => {
      const all = await api.repo.list();
      if (!all.ok) return;
      const r = all.value.repos.find((x) => x.id === activeRepoId);
      if (!r) return;
      const c = await api.config.get({ repoPath: r.path });
      if (c.ok && c.value.config.jira?.enabled) {
        setJiraEnabled(true);
        const t = await api.secrets.get({ key: c.value.config.jira.tokenKeychainKey });
        setTokenPresent(t.ok ? t.value.value !== null : false);
      } else {
        setJiraEnabled(false);
        setTokenPresent(false);
      }
    })();
  }, [activeRepoId]);

  if (jiraEnabled === false || tokenPresent === false) {
    return <PreflightNotice onOpenSettings={onOpenSettings} />;
  }
  if (jiraEnabled === null)
    return <div style={{ color: "var(--color-text-muted)" }}>Loading...</div>;

  async function resolve(): Promise<void> {
    if (!activeRepoId || !ticketInput) return;
    setResolving(true);
    setResolveError(null);
    const r = await api.jira.resolve({ repoId: activeRepoId, ticketInput });
    setResolving(false);
    if (!r.ok) {
      setResolveError(r.error.message);
      return;
    }
    setResolved({
      ticketKey: r.value.ticketKey,
      summary: r.value.summary,
      branch: r.value.suggestedBranch,
    });
    setDraftBranch(r.value.suggestedBranch);
  }

  const branchValue = editingBranch ? draftBranch : (resolved?.branch ?? "");
  const branchValid = validateBranchName(branchValue, { requireJiraPattern });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-text-muted text-xs tracking-[0.04em] uppercase">
        Jira Ticket (URL or ID)
      </span>
      <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
        <input
          className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2"
          placeholder="https://x.atlassian.net/browse/PROJ-123"
          value={ticketInput}
          onChange={(e) => setTicketInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
          onClick={() => void resolve()}
          disabled={!ticketInput || resolving}
        >
          {resolving ? "Resolving..." : "Resolve"}
        </button>
      </div>
      {resolveError && <span className="text-destructive text-xs">{resolveError}</span>}
      {resolved && (
        <>
          <span className="text-text-muted text-xs tracking-[0.04em] uppercase">
            Branch Preview
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <input
              className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2"
              value={branchValue}
              readOnly={!editingBranch}
              onChange={(e) => setDraftBranch(e.target.value)}
              style={{ flex: 1 }}
            />
            <Tooltip label="Edit branch name">
              <button
                className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
                onClick={() => setEditingBranch(true)}
              >
                <Icon icon={Pencil} size={12} />
              </button>
            </Tooltip>
          </div>
          {!branchValid.ok && (
            <span className="text-destructive text-xs">Invalid branch name.</span>
          )}
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            {resolved.summary}
          </span>
        </>
      )}
      <div className="flex justify-end gap-3">
        <button
          className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!resolved || !branchValid.ok || busy}
          onClick={() => (resolved && branchValid.ok ? void onSubmit(branchValue) : undefined)}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
