import { Card } from "../card/Card";
import { ProvisioningCard } from "../card/ProvisioningCard";
import { cn } from "../lib/cn";
import { useRepos } from "../state/repos";
import { useWorktrees, worktreeId } from "../state/worktrees";
import { useNewWorktreeJobs } from "../state/newWorktree";
import { NoWorktree } from "../empty/NoWorktree";
import { useOverviewGridDensity } from "../state/overviewGridDensity";

export function Grid(): React.JSX.Element {
  const { worktrees, activeId, setActive } = useWorktrees();
  const { activeRepoId } = useRepos();
  const { jobs } = useNewWorktreeJobs();
  const { density } = useOverviewGridDensity();
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
  const gridClass = cn(
    "grid gap-3 p-3",
    density === "2x2" ? "grid-card-rows-2 grid-cols-2" : "grid-card-rows-3 grid-cols-3"
  );
  return (
    <div className={gridClass}>
      {worktrees.map((wt) => {
        const id = worktreeId(wt);
        return (
          <Card
            key={id}
            repoId={activeRepoId}
            branch={wt.branch ?? "(detached)"}
            cwd={wt.path}
            active={id === activeId}
            onActivate={() => setActive(id)}
          />
        );
      })}
      {liveJobs.map((job) => (
        <ProvisioningCard key={job.id} job={job} />
      ))}
    </div>
  );
}
