import { Card } from "../card/Card";
import { ProvisioningCard } from "../card/ProvisioningCard";
import { useRepos } from "../state/repos";
import { useWorktrees, worktreeId } from "../state/worktrees";
import { useNewWorktreeJobs } from "../state/newWorktree";
import { NoWorktree } from "../empty/NoWorktree";

export function Grid(): React.JSX.Element {
  const { worktrees, activeId, setActive } = useWorktrees();
  const { activeRepoId } = useRepos();
  const { jobs } = useNewWorktreeJobs();
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
  return (
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
