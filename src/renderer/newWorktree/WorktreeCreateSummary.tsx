import type { RepoConfigDto } from "@shared/ipc";

type Props = {
  config: RepoConfigDto | null;
  branchPreview: string;
};

function targetPath(baseDir: string, branch: string): string {
  if (!branch) return "";
  const trimmedBase = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
  return `${trimmedBase}/${branch}`;
}

function SummaryRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-secondary min-w-0 truncate">{value}</dd>
    </div>
  );
}

export function WorktreeCreateSummary({ config, branchPreview }: Props): React.JSX.Element {
  const baseBranch = config?.worktree.defaultBaseBranch ?? "Loading";
  const baseDir = config?.worktree.baseDir ?? "Loading";
  const preview =
    config && branchPreview ? targetPath(config.worktree.baseDir, branchPreview) : "Not selected";

  return (
    <section
      aria-label="Create summary"
      className="border-border-subtle rounded-md border p-4 text-sm"
    >
      <dl className="flex flex-col gap-3">
        <SummaryRow label="Base branch" value={baseBranch} />
        <SummaryRow label="Worktree directory" value={baseDir} />
        <SummaryRow label="Target path" value={preview} />
      </dl>
    </section>
  );
}
