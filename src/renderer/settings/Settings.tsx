import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, KeyRound, Loader2, Plug, Save, X } from "lucide-react";
import { Dialog, Label } from "../ui";
import { Icon, type LucideIcon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { useToast } from "../state/toast";
import type { ConfigError, ConfigSaveError, RepoConfigDto } from "@shared/ipc";
import {
  formFromConfig,
  normalizeRepositorySettingsForm,
  type RepositorySettingsForm,
} from "./settingsForm";

type Props = { open: boolean; onClose: () => void };

type SettingsSection = "worktree-paths" | "worktree-bootstrap" | "jira-connection" | "jira-token";

type SettingsNavItem = {
  section: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
};

const WORKTREE_NAV_ITEMS: SettingsNavItem[] = [
  {
    section: "worktree-paths",
    label: "Paths",
    description: "Base dir and branch",
    icon: FolderOpen,
  },
  {
    section: "worktree-bootstrap",
    label: "Bootstrap",
    description: "Copy, install, init",
    icon: GitBranch,
  },
];

const JIRA_NAV_ITEMS: SettingsNavItem[] = [
  {
    section: "jira-connection",
    label: "Connection",
    description: "Workspace and account",
    icon: Plug,
  },
  {
    section: "jira-token",
    label: "Token",
    description: "Keychain credential",
    icon: KeyRound,
  },
];

const INPUT_CLASS =
  "border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40";

const TEXTAREA_CLASS = cn(
  INPUT_CLASS,
  "scrollbar-hidden min-h-[112px] resize-none overflow-y-auto"
);

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

function SettingsNavGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="text-text-muted px-2 text-xs font-medium uppercase">{title}</div>
      {children}
    </div>
  );
}

function SettingsNavButton({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: SettingsNavItem;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors duration-150",
        active
          ? "border-accent-soft bg-surface text-text-primary"
          : "text-text-secondary hover:bg-surface border-transparent"
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors duration-150",
          active ? "bg-elevated text-text-primary" : "text-text-muted group-hover:text-text-primary"
        )}
      >
        <Icon icon={item.icon} size={14} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{item.label}</span>
        <span className="text-text-muted truncate text-xs">{item.description}</span>
      </span>
    </button>
  );
}

function SettingsNavSection({
  title,
  items,
  activeSection,
  onSelect,
}: {
  title: string;
  items: SettingsNavItem[];
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}): React.JSX.Element {
  return (
    <SettingsNavGroup title={title}>
      {items.map((item) => (
        <SettingsNavButton
          key={item.section}
          active={activeSection === item.section}
          item={item}
          onClick={() => onSelect(item.section)}
        />
      ))}
    </SettingsNavGroup>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function Settings({ open, onClose }: Props): React.JSX.Element | null {
  const { repos, activeRepoId } = useRepos();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  const toast = useToast();
  const [section, setSection] = useState<SettingsSection>("worktree-paths");
  const [form, setForm] = useState<RepositorySettingsForm | null>(null);
  const [loadedConfig, setLoadedConfig] = useState<RepoConfigDto | null>(null);
  const [token, setToken] = useState("");
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
    setSection("worktree-paths");
    setForm(null);
    setLoadedConfig(null);
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
          setLoadingError(`Cannot load repository settings: ${describeConfigError(c.error)}`);
          return;
        }

        setLoadedConfig(c.value.config);
        setForm(formFromConfig(c.value.config, defaultTokenKey(repo.name)));

        const jira = c.value.config.jira;
        if (!jira?.enabled || !jira.tokenKeychainKey.trim()) return;

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
        setLoadingError(`Cannot load repository settings: ${describeUnknownError(error)}`);
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
  const tokenKey = form?.jira.tokenKeychainKey.trim() ?? "";
  const tokenAvailableForCurrentKey = tokenPresent && storedTokenKey === tokenKey;
  const cannotSaveReason = saveError ?? loadingError;
  const saveDisabled = busy || form === null;
  const errorId = "settings-repository-error";

  function clearErrors(): void {
    setSaveError(null);
    setSupportingError(null);
  }

  function updateWorktree(patch: Partial<RepositorySettingsForm["worktree"]>): void {
    setForm((current) =>
      current ? { ...current, worktree: { ...current.worktree, ...patch } } : current
    );
    clearErrors();
  }

  function updateJira(patch: Partial<RepositorySettingsForm["jira"]>): void {
    setForm((current) => (current ? { ...current, jira: { ...current.jira, ...patch } } : current));
    clearErrors();
  }

  async function save(): Promise<void> {
    if (busy || !form) return;
    clearErrors();

    if (loadingError) {
      setSaveError(loadingError);
      return;
    }

    const nextConfig = normalizeRepositorySettingsForm(form, loadedConfig ?? undefined);
    const nextToken = token.trim();
    const nextTokenKey = nextConfig.jira?.tokenKeychainKey ?? "";
    const tokenAvailableForKey = tokenPresent && storedTokenKey === nextTokenKey;

    if (!nextConfig.worktree.baseDir) {
      setSaveError("Enter a worktree base directory.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    if (!nextConfig.worktree.defaultBaseBranch) {
      setSaveError("Enter a default base branch.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    if (!nextConfig.worktree.installCommand) {
      setSaveError("Enter an install command.");
      setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
      return;
    }

    if (nextConfig.jira?.enabled) {
      if (!nextConfig.jira.workspaceUrl) {
        setSaveError("Enter a Jira workspace URL.");
        setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
        return;
      }

      if (!nextConfig.jira.email) {
        setSaveError("Enter the Jira account email.");
        setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
        return;
      }

      if (!nextConfig.jira.tokenKeychainKey) {
        setSaveError("Enter a Keychain token key.");
        setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
        return;
      }

      if (!nextToken && !tokenAvailableForKey) {
        setSaveError("Enter a Jira API token before saving.");
        setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
        return;
      }
    }

    setSaving(true);
    try {
      const configResult = await api.config.saveRepository({
        repoPath: selectedRepo.path,
        config: nextConfig,
      });

      if (!configResult.ok) {
        setSaveError(describeConfigSaveError(configResult.error));
        setSupportingError(`Expected config: ${expectedConfigPath(selectedRepo.path)}`);
        return;
      }

      setLoadedConfig(configResult.value.config);

      if (nextToken && nextConfig.jira) {
        const tokenResult = await api.secrets.set({
          key: nextConfig.jira.tokenKeychainKey,
          value: nextToken,
        });
        if (!tokenResult.ok) {
          setSaveError("Repository config was saved, but the Jira token could not be stored.");
          setSupportingError(tokenResult.error.message);
          return;
        }
        setTokenPresent(true);
        setStoredTokenKey(nextConfig.jira.tokenKeychainKey);
        setToken("");
      }

      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function clearToken(): Promise<void> {
    if (busy) return;
    clearErrors();

    if (!tokenKey) {
      setSaveError("Enter a Keychain token key before clearing the token.");
      return;
    }

    setClearing(true);
    try {
      const r = await api.secrets.remove({ key: tokenKey });
      if (r.ok) {
        if (storedTokenKey === tokenKey) {
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

  function renderPanel(): React.JSX.Element {
    if (!form) {
      return (
        <div className="text-text-muted text-sm">
          {loading ? "Loading settings..." : "No settings"}
        </div>
      );
    }

    if (section === "worktree-paths") {
      return (
        <div className="flex flex-col gap-4">
          <Field id="settings-worktree-base-dir" label="Base Directory">
            <input
              id="settings-worktree-base-dir"
              className={INPUT_CLASS}
              value={form.worktree.baseDir}
              onChange={(e) => updateWorktree({ baseDir: e.target.value })}
              disabled={busy}
            />
          </Field>
          <Field id="settings-worktree-default-base-branch" label="Default Base Branch">
            <input
              id="settings-worktree-default-base-branch"
              className={INPUT_CLASS}
              value={form.worktree.defaultBaseBranch}
              onChange={(e) => updateWorktree({ defaultBaseBranch: e.target.value })}
              disabled={busy}
            />
          </Field>
        </div>
      );
    }

    if (section === "worktree-bootstrap") {
      return (
        <div className="flex flex-col gap-4">
          <Field id="settings-worktree-files-to-copy" label="Files to Copy">
            <textarea
              id="settings-worktree-files-to-copy"
              className={TEXTAREA_CLASS}
              value={form.worktree.filesToCopyText}
              onChange={(e) => updateWorktree({ filesToCopyText: e.target.value })}
              disabled={busy}
            />
          </Field>
          <Field id="settings-worktree-install-command" label="Install Command">
            <input
              id="settings-worktree-install-command"
              className={INPUT_CLASS}
              value={form.worktree.installCommand}
              onChange={(e) => updateWorktree({ installCommand: e.target.value })}
              disabled={busy}
            />
          </Field>
          <Field id="settings-worktree-init-commands" label="Init Commands">
            <textarea
              id="settings-worktree-init-commands"
              className={TEXTAREA_CLASS}
              value={form.worktree.initCommandsText}
              onChange={(e) => updateWorktree({ initCommandsText: e.target.value })}
              disabled={busy}
            />
          </Field>
        </div>
      );
    }

    if (section === "jira-connection") {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              id="settings-jira-enabled"
              type="checkbox"
              checked={form.jira.enabled}
              onChange={(e) => updateJira({ enabled: e.target.checked })}
              disabled={busy}
            />
            <Label htmlFor="settings-jira-enabled">Enable Jira</Label>
          </div>
          <Field id="settings-jira-workspace-url" label="Workspace URL">
            <input
              id="settings-jira-workspace-url"
              className={INPUT_CLASS}
              type="url"
              value={form.jira.workspaceUrl}
              onChange={(e) => updateJira({ workspaceUrl: e.target.value })}
              disabled={busy || !form.jira.enabled}
            />
          </Field>
          <Field id="settings-jira-email" label="Email">
            <input
              id="settings-jira-email"
              className={INPUT_CLASS}
              type="email"
              value={form.jira.email}
              onChange={(e) => updateJira({ email: e.target.value })}
              disabled={busy || !form.jira.enabled}
            />
          </Field>
          <Field id="settings-jira-token-key" label="Keychain Token Key">
            <input
              id="settings-jira-token-key"
              className={INPUT_CLASS}
              value={form.jira.tokenKeychainKey}
              onChange={(e) => updateJira({ tokenKeychainKey: e.target.value })}
              disabled={busy || !form.jira.enabled}
            />
          </Field>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-text-muted text-xs font-medium uppercase">Status</span>
          <div
            className={cn(
              "text-sm",
              tokenAvailableForCurrentKey ? "text-success" : "text-destructive"
            )}
          >
            {tokenAvailableForCurrentKey ? "Token stored in Keychain" : "No token stored"}
          </div>
        </div>
        <Field id="settings-token" label="API Token">
          <input
            id="settings-token"
            className={INPUT_CLASS}
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              clearErrors();
            }}
            disabled={busy || !form.jira.enabled}
            aria-invalid={Boolean(cannotSaveReason)}
            aria-describedby={cannotSaveReason ? errorId : undefined}
          />
        </Field>
        {tokenAvailableForCurrentKey && (
          <button
            className="text-text-secondary hover:bg-elevated self-start rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void clearToken()}
            disabled={busy}
            type="button"
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Content size="settings">
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Settings sections"
            className="settings-nav-width bg-background border-border-subtle flex shrink-0 flex-col gap-4 border-r py-4"
          >
            <SettingsNavSection
              title="Worktree"
              items={WORKTREE_NAV_ITEMS}
              activeSection={section}
              onSelect={setSection}
            />
            <SettingsNavSection
              title="Jira"
              items={JIRA_NAV_ITEMS}
              activeSection={section}
              onSelect={setSection}
            />
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <Dialog.Header>
              <div className="border-border-subtle flex h-14 items-center border-b px-6">
                <Dialog.Title>Settings · Repository</Dialog.Title>
              </div>
              <div className="absolute top-4 right-4">
                <Dialog.Close disabled={busy} ariaLabel="Close settings" />
              </div>
            </Dialog.Header>
            <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto p-6">
              {renderPanel()}
            </div>
            {cannotSaveReason && (
              <div
                id={errorId}
                className="border-border-subtle flex flex-col gap-1 border-t px-6 py-3"
                role="alert"
              >
                <span className="text-destructive text-xs">Cannot save repository settings</span>
                <span className="text-text-muted text-xs">{cannotSaveReason}</span>
                {supportingError && (
                  <span className="text-text-muted text-xs">{supportingError}</span>
                )}
              </div>
            )}
            <Dialog.Footer>
              <div className="border-border-subtle bg-background flex min-h-16 w-full items-center justify-end gap-3 border-t px-6 py-4">
                <button
                  className="border-border-strong bg-surface text-text-secondary hover:bg-elevated hover:text-text-primary inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={onClose}
                  disabled={busy}
                  type="button"
                >
                  <Icon icon={X} size={14} />
                  Cancel
                </button>
                <button
                  aria-busy={saving}
                  className="bg-accent text-text-primary inline-flex h-8 min-w-24 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void save()}
                  disabled={saveDisabled}
                  type="button"
                >
                  {saving ? (
                    <Icon icon={Loader2} className="animate-spin" size={14} />
                  ) : (
                    <Icon icon={Save} size={14} />
                  )}
                  {saving ? "Saving" : "Save"}
                </button>
              </div>
            </Dialog.Footer>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
