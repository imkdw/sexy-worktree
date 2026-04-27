import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "../card/Card";
import { ProvisioningCard } from "../card/ProvisioningCard";
import { useRepos } from "../state/repos";
import { useWorktrees, worktreeId } from "../state/worktrees";
import { useNewWorktreeJobs } from "../state/newWorktree";
import { useSelectMode } from "../state/selectMode";
import { ConfirmDeleteModal } from "../selectMode/ConfirmDeleteModal";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { NoWorktree } from "../empty/NoWorktree";

export function Grid(): React.JSX.Element {
  const { worktrees, activeId, setActive } = useWorktrees();
  const { activeRepoId } = useRepos();
  const { jobs } = useNewWorktreeJobs();
  const sm = useSelectMode();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const liveJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "running" || j.status === "failed"
  );
  if (!activeRepoId)
    return (
      <div className="text-text-faint flex h-full items-center justify-center text-base">
        Open a repository to start.
      </div>
    );
  if (worktrees.length === 0 && liveJobs.length === 0) return <NoWorktree />;
  const allIds = worktrees.map((wt) => wt.path);
  const selectableCount = [...sm.selected].filter((id) => {
    const wt = worktrees.find((w) => w.path === id);
    return wt && !wt.isMain;
  }).length;
  return (
    <div className="relative h-full">
      <div className="grid-card-rows grid grid-cols-2 gap-3 p-3">
        {worktrees.map((wt) => {
          const id = worktreeId(wt);
          return (
            <Card
              key={id}
              repoId={activeRepoId}
              branch={wt.branch ?? "(detached)"}
              cwd={wt.path}
              active={id === activeId}
              isMain={wt.isMain}
              onActivate={() => setActive(id)}
              allIds={allIds}
            />
          );
        })}
        {liveJobs.map((job) => (
          <ProvisioningCard key={job.id} job={job} />
        ))}
      </div>
      {sm.active && (
        <div className="border-border-subtle bg-surface sticky inset-x-0 bottom-0 flex items-center justify-between border-t px-4 py-3">
          <span className="text-text-secondary text-sm">{selectableCount} selected</span>
          <div className="flex gap-3">
            <button
              className="text-text-secondary rounded-sm px-3 py-2 text-sm"
              onClick={() => sm.exit()}
            >
              Cancel
            </button>
            <button
              className={cn(
                "text-background flex items-center gap-1 rounded-sm px-3 py-2 text-sm font-medium",
                selectableCount > 0
                  ? "bg-destructive cursor-pointer opacity-100"
                  : "bg-border-subtle cursor-not-allowed opacity-50"
              )}
              disabled={selectableCount === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Icon icon={Trash2} size={14} />
              Force Delete
            </button>
          </div>
        </div>
      )}
      <ConfirmDeleteModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </div>
  );
}
