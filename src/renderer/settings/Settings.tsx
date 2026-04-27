import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";
import { useToast } from "../state/toast";

type Props = { open: boolean; onClose: () => void };

export function Settings({ open, onClose }: Props): React.JSX.Element | null {
  const { repos, activeRepoId } = useRepos();
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;
  const toast = useToast();
  const [tokenKey, setTokenKey] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [tokenPresent, setTokenPresent] = useState(false);

  useEffect(() => {
    if (!open || !repo) return;
    void (async () => {
      const c = await api.config.get({ repoPath: repo.path });
      if (c.ok && c.value.config.jira) {
        setTokenKey(c.value.config.jira.tokenKeychainKey);
        const v = await api.secrets.get({ key: c.value.config.jira.tokenKeychainKey });
        setTokenPresent(v.ok && v.value.value !== null);
      }
    })();
  }, [open, repo]);

  if (!open || !repo) return null;

  async function save(): Promise<void> {
    if (!tokenKey || !token) return;
    const r = await api.secrets.set({ key: tokenKey, value: token });
    if (r.ok) {
      toast.push({ kind: "success", title: "Jira token saved", durationMs: 3000 });
      setTokenPresent(true);
      setToken("");
    } else {
      toast.push({
        kind: "error",
        title: "Failed to save token",
        description: r.error.message,
        durationMs: 5000,
      });
    }
  }
  async function clearToken(): Promise<void> {
    if (!tokenKey) return;
    await api.secrets.remove({ key: tokenKey });
    setTokenPresent(false);
    toast.push({ kind: "success", title: "Jira token cleared", durationMs: 3000 });
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-modal-wide border-border-subtle bg-surface flex max-w-[95vw] flex-col gap-4 rounded-lg border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between">
          <span className="text-text-primary text-lg font-semibold">Settings · Jira</span>
          <button onClick={onClose}>
            <Icon icon={X} size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-text-muted text-xs tracking-[0.04em] uppercase">Status</span>
          <div className={cn("text-sm", tokenPresent ? "text-success" : "text-destructive")}>
            {tokenPresent ? "Token stored in Keychain" : "No token stored"}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-text-muted text-xs tracking-[0.04em] uppercase">API Token</span>
          <input
            className="border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ATATT…"
          />
        </div>
        <div className="flex justify-end gap-3">
          {tokenPresent && (
            <button
              className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
              onClick={() => void clearToken()}
            >
              Clear
            </button>
          )}
          <button
            className="bg-accent text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void save()}
            disabled={!token}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
