import { Card } from "../card/Card";
import { ProvisioningCard } from "../card/ProvisioningCard";
import type { Worktree } from "@shared/ipc";
import { cn } from "../lib/cn";
import { useRepos } from "../state/repos";
import { useWorktrees } from "../state/worktrees";
import { useTerminalSessionCards } from "../state/terminalSessions";
import { useNewWorktreeJobs } from "../state/newWorktree";
import { NoWorktree } from "../empty/NoWorktree";
import { NoTerminal } from "../empty/NoTerminal";
import { useOverviewGridDensity } from "../state/overviewGridDensity";

export function Grid(): React.JSX.Element {
  const { worktrees, activeId, setActive } = useWorktrees();
  const { activeRepoId } = useRepos();
  const { getOpenCards } = useTerminalSessionCards();
  const { jobs } = useNewWorktreeJobs();
  const { density } = useOverviewGridDensity();
  const liveJobs = jobs.filter(
    (j) =>
      j.status === "queued" ||
      j.status === "running" ||
      j.status === "cleaning" ||
      j.status === "failed"
  );
  if (!activeRepoId)
    return (
      <div className="text-text-faint flex h-full items-center justify-center text-base">
        Open a repository to start.
      </div>
    );
  if (worktrees.length === 0 && liveJobs.length === 0) return <NoWorktree />;

  const worktreeByPath = new Map(worktrees.map((wt) => [wt.path, wt]));
  const openWorktrees = getOpenCards(activeRepoId)
    .map((path) => worktreeByPath.get(path) ?? null)
    .filter((wt): wt is Worktree => wt !== null);

  if (openWorktrees.length === 0 && liveJobs.length === 0) {
    return <NoTerminal mode="overview" />;
  }

  const gridClass = cn(
    "grid gap-3 p-3",
    density === "2x2" ? "grid-card-rows-2 grid-cols-2" : "grid-card-rows-3 grid-cols-3"
  );
  return (
    <div className={gridClass}>
      {openWorktrees.map((wt) => (
        <Card
          key={wt.path}
          repoId={activeRepoId}
          branch={wt.branch ?? "(detached)"}
          cwd={wt.path}
          active={wt.path === activeId}
          onActivate={() => setActive(wt.path)}
        />
      ))}
      {liveJobs.map((job) => (
        <ProvisioningCard key={job.id} job={job} />
      ))}
    </div>
  );
}
