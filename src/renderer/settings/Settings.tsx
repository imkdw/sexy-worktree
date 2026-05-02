import { useEffect, useState } from "react";
import { Dialog, Label } from "../ui";
import { cn } from "../lib/cn";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { useToast } from "../state/toast";
import type { ConfigError, ConfigSaveError } from "@shared/ipc";

type Props = { open: boolean; onClose: () => void };

function describeConfigError(error: ConfigError): string {
  if (error.kind === "invalid") return error.issues.join(", ");
  return error.message;
}

function expectedConfigPath(repoPath: string): string {
  return `${repoPath}/.sexyworktree/config.json`;
}

function defaultTokenKey(repoName: string): string {
  return `jira.${repoName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function describeConfigSaveError(error: ConfigSaveError): string {
  if (error.kind === "invalid") return error.issues.join(", ");
  return error.message;
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Settings({ open, onClose }: Props): React.JSX.Element | null {
  const { repos, activeRepoId } = useRepos();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  const toast = useToast();
  const [workspaceUrl, setWorkspaceUrl] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [tokenKey, setTokenKey] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [tokenPresent, setTokenPresent] = useState(false);
  const [storedTokenKey, setStoredTokenKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [supportingError, setSupportingError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !repo) return;

    let cancelled = false;
    setWorkspaceUrl("");
    setEmail("");
    setTokenKey(defaultTokenKey(repo.name));
    setToken("");
    setTokenPresent(false);
    setStoredTokenKey(null);
    setLoading(true);
    setSaving(false);
    setClearing(false);
    setLoadingError(null);
    setSaveError(null);
    setSupportingError(null);

    void (async () => {
      try {
        const c = await api.config.get({ repoPath: repo.path });
        if (cancelled) return;

        if (!c.ok) {
          setLoadingError(`Cannot load Jira settings: ${describeConfigError(c.error)}`);
          return;
        }

        const jira = c.value.config.jira;
        if (!jira?.enabled) return;

        setWorkspaceUrl(jira.workspaceUrl);
        setEmail(jira.email);
        setTokenKey(jira.tokenKeychainKey);

        try {
          const v = await api.secrets.get({ key: jira.tokenKeychainKey });
          if (cancelled) return;
          const present = v.ok && v.value.value !== null;
          setTokenPresent(present);
          setStoredTokenKey(present ? jira.tokenKeychainKey : null);
          if (!v.ok) setSaveError(`Cannot read Jira token status: ${v.error.message}`);
        } catch (error) {
          if (cancelled) return;
          setSaveError(`Cannot read Jira token status: ${describeUnknownError(error)}`);
        }
      } catch (error) {
        if (cancelled) return;
        setLoadingError(`Cannot load Jira settings: ${describeUnknownError(error)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, repo]);

  if (!repo) return null;
  const selectedRepo = repo;
  const busy = loading || saving || clearing;

  async function save(): Promise<void> {
    if (busy) return;
    setSaveError(null);
    setSupportingError(null);

    if (loadingError) {
      setSaveError(loadingError);
      return;
    }

    const nextWorkspaceUrl = workspaceUrl.trim();
    const nextEmail = email.trim();
    const nextTokenKey = tokenKey.trim();
    const nextToken = token.trim();
    const tokenAvailableForKey = tokenPresent && storedTokenKey === nextTokenKey;

    if (!nextWorkspaceUrl) {
      setSaveError("Enter a Jira workspace URL.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    if (!nextEmail) {
      setSaveError("Enter the Jira account email.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    if (!nextTokenKey) {
      setSaveError("Enter a Keychain token key.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    if (!nextToken && !tokenAvailableForKey) {
      setSaveError("Enter a Jira API token before saving.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    setSaving(true);
    try {
      const configResult = await api.config.saveJira({
        repoPath: selectedRepo.path,
        jira: {
          enabled: true,
          workspaceUrl: nextWorkspaceUrl,
          email: nextEmail,
          tokenKeychainKey: nextTokenKey,
        },
      });

      if (!configResult.ok) {
        setSaveError(describeConfigSaveError(configResult.error));
        setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
        return;
      }

      if (nextToken) {
        const tokenResult = await api.secrets.set({ key: nextTokenKey, value: nextToken });
        if (!tokenResult.ok) {
          setSaveError("Jira config was saved, but the token could not be stored.");
          setSupportingError(tokenResult.error.message);
          return;
        }
        setTokenPresent(true);
        setStoredTokenKey(nextTokenKey);
        setToken("");
      }

      setWorkspaceUrl(nextWorkspaceUrl);
      setEmail(nextEmail);
      setTokenKey(nextTokenKey);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function clearToken(): Promise<void> {
    if (busy) return;
    setSaveError(null);
    setSupportingError(null);

    const key = tokenKey.trim();
    if (!key) {
      setSaveError("Enter a Keychain token key before clearing the token.");
      return;
    }

    setClearing(true);
    try {
      const r = await api.secrets.remove({ key });
      if (r.ok) {
        if (storedTokenKey === key) {
          setTokenPresent(false);
          setStoredTokenKey(null);
        }
        toast.push({ kind: "success", title: "Jira token cleared", durationMs: 3000 });
        return;
      }

      toast.push({
        kind: "error",
        title: "Failed to clear token",
        description: r.error.message,
        durationMs: 5000,
      });
    } finally {
      setClearing(false);
    }
  }

  const tokenAvailableForCurrentKey = tokenPresent && storedTokenKey === tokenKey.trim();
  const cannotSaveReason = saveError ?? loadingError;
  const saveDisabled = busy;
  const errorId = "settings-jira-error";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Content size="wide">
        <Dialog.Header>
          <Dialog.Title>Settings · Jira</Dialog.Title>
          <Dialog.Close disabled={busy} ariaLabel="Close settings" />
        </Dialog.Header>
        <div className="flex flex-col gap-2">
          <span className="text-text-muted text-xs tracking-[0.04em] uppercase">Status</span>
          <div
            className={cn(
              "text-sm",
              tokenAvailableForCurrentKey ? "text-success" : "text-destructive"
            )}
          >
            {tokenAvailableForCurrentKey ? "Token stored in Keychain" : "No token stored"}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-jira-workspace-url">Workspace URL</Label>
          <input
            id="settings-jira-workspace-url"
            className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            type="url"
            value={workspaceUrl}
            onChange={(e) => {
              setWorkspaceUrl(e.target.value);
              setSaveError(null);
              setSupportingError(null);
            }}
            placeholder="https://example.atlassian.net"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-jira-email">Email</Label>
          <input
            id="settings-jira-email"
            className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSaveError(null);
              setSupportingError(null);
            }}
            placeholder="dev@example.com"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-jira-token-key">Keychain Token Key</Label>
          <input
            id="settings-jira-token-key"
            className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            type="text"
            value={tokenKey}
            onChange={(e) => {
              setTokenKey(e.target.value);
              setSaveError(null);
              setSupportingError(null);
            }}
            placeholder="jira.example"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-token">API Token</Label>
          <input
            id="settings-token"
            className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setSaveError(null);
              setSupportingError(null);
            }}
            placeholder="ATATT..."
            disabled={busy}
            aria-invalid={Boolean(cannotSaveReason)}
            aria-describedby={cannotSaveReason ? errorId : undefined}
          />
          {cannotSaveReason && (
            <div id={errorId} className="flex flex-col gap-1" role="alert">
              <span className="text-destructive text-xs">Cannot save Jira settings</span>
              <span className="text-text-muted text-xs">{cannotSaveReason}</span>
              {supportingError && (
                <span className="text-text-muted text-xs">{supportingError}</span>
              )}
            </div>
          )}
        </div>
        <Dialog.Footer>
          {tokenAvailableForCurrentKey && (
            <button
              className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void clearToken()}
              disabled={busy}
            >
              Clear
            </button>
          )}
          <button
            className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void save()}
            disabled={saveDisabled}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
