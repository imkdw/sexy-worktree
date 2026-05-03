import { AlertCircle, Check, Circle, Loader2, X, type LucideIcon } from "lucide-react";
import type {
  DeleteWorktreeItemStatus,
  DeleteWorktreeJobItem,
  DeleteWorktreeJobSnapshot,
} from "@shared/deleteWorktree";
import { isDeleteWorktreeJobTerminal } from "@shared/deleteWorktree";
import { Icon } from "../icons/Icon";
import { useDeleteWorktreeJobs } from "../state/deleteWorktree";

type Counts = {
  total: number;
  deleted: number;
  failed: number;
  cancelled: number;
};

const STATUS_TEXT: Record<DeleteWorktreeItemStatus, string> = {
  pending: "Pending",
  deleting: "Deleting",
  deleted: "Deleted",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_ICON: Record<DeleteWorktreeItemStatus, LucideIcon> = {
  pending: Circle,
  deleting: Loader2,
  deleted: Check,
  failed: AlertCircle,
  cancelled: X,
};

const STATUS_CLASS: Record<DeleteWorktreeItemStatus, string> = {
  pending: "text-text-faint",
  deleting: "text-in-progress",
  deleted: "text-success",
  failed: "text-destructive",
  cancelled: "text-text-muted",
};

const ACTION_BUTTON_CLASS =
  "border-border-strong bg-background text-text-secondary hover:bg-elevated hover:text-text-primary focus-visible:outline-accent-soft shrink-0 rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40";

function countItems(job: DeleteWorktreeJobSnapshot): Counts {
  return job.items.reduce<Counts>(
    (counts, item) => {
      if (item.status === "deleted") counts.deleted += 1;
      if (item.status === "failed") counts.failed += 1;
      if (item.status === "cancelled") counts.cancelled += 1;
      return counts;
    },
    { total: job.items.length, deleted: 0, failed: 0, cancelled: 0 }
  );
}

function getSummary(counts: Counts): string {
  const parts = [`${counts.deleted} / ${counts.total} deleted`];
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} cancelled`);
  return parts.join(", ");
}

function canDismiss(job: DeleteWorktreeJobSnapshot): boolean {
  return isDeleteWorktreeJobTerminal(job.status) && job.status !== "done";
}

function JobItem({ item }: { item: DeleteWorktreeJobItem }): React.JSX.Element {
  const IconComponent = STATUS_ICON[item.status];
  const iconClass =
    item.status === "deleting"
      ? `${STATUS_CLASS[item.status]} animate-spin`
      : STATUS_CLASS[item.status];

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          icon={IconComponent}
          size={14}
          className={`${iconClass} shrink-0`}
          aria-hidden={true}
        />
        <span className="text-text-primary min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
          {item.branch ?? "(detached)"}
        </span>
        <span className={`${STATUS_CLASS[item.status]} shrink-0 text-xs`}>
          {STATUS_TEXT[item.status]}
        </span>
      </div>
      {item.status === "failed" && item.errorMessage ? (
        <p
          className="text-destructive overflow-hidden text-ellipsis whitespace-nowrap pl-6 text-xs"
          title={item.errorMessage}
        >
          {item.errorMessage}
        </p>
      ) : null}
    </li>
  );
}

function JobCard({
  job,
  cancel,
  dismiss,
}: {
  job: DeleteWorktreeJobSnapshot;
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
}): React.JSX.Element {
  const counts = countItems(job);

  return (
    <section className="border-border-subtle bg-surface rounded-md border">
      <header className="border-border-subtle flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <h3 className="text-text-primary text-sm font-medium">Deleting worktrees</h3>
          <p className="text-text-muted mt-1 text-xs">{getSummary(counts)}</p>
        </div>
        {job.status === "running" ? (
          <button
            type="button"
            className={ACTION_BUTTON_CLASS}
            onClick={() => void cancel(job.id)}
            disabled={job.cancelRequested}
          >
            Cancel Pending
          </button>
        ) : null}
        {canDismiss(job) ? (
          <button
            type="button"
            className={ACTION_BUTTON_CLASS}
            onClick={() => void dismiss(job.id)}
          >
            Dismiss
          </button>
        ) : null}
      </header>
      <ul className="divide-border-subtle divide-y px-3">
        {job.items.map((item) => (
          <JobItem key={item.worktreePath} item={item} />
        ))}
      </ul>
    </section>
  );
}

export function BackgroundJobsPanel(): React.JSX.Element | null {
  const { jobs, cancel, dismiss } = useDeleteWorktreeJobs();

  if (jobs.length === 0) return null;

  return (
    <aside className="border-border-subtle bg-background flex w-toast max-w-full shrink flex-col border-l">
      <header className="border-border-subtle flex items-center border-b p-3">
        <h2 className="text-text-primary text-sm font-medium">Background Jobs</h2>
      </header>
      <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} cancel={cancel} dismiss={dismiss} />
        ))}
      </div>
    </aside>
  );
}
