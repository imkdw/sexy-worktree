import { Check, Circle, Loader2, XCircle } from "lucide-react";
import { Icon } from "../icons/Icon";
import { ALL_STEPS, type JobSnapshot, type StepKey, type StepStatus } from "@shared/newWorktree";
import { api } from "../ipc/api";
import { cn } from "../lib/cn";

const STEP_LABELS: Record<StepKey, string> = {
  fetch: "git fetch origin",
  "worktree-add": "git worktree add",
  "files-copy": "Copy env files",
  clonefile: "Clone node_modules (APFS clonefile)",
  install: "Install dependencies",
  "init-commands": "Run init commands",
};

function StepIcon({ status }: { status: StepStatus }): React.JSX.Element {
  if (status === "done")
    return <Icon icon={Check} size={14} className="text-success" aria-label="done" />;
  if (status === "in-progress")
    return (
      <Icon
        icon={Loader2}
        size={14}
        className="text-in-progress animate-spin"
        aria-label="in progress"
      />
    );
  if (status === "failed")
    return <Icon icon={XCircle} size={14} className="text-destructive" aria-label="failed" />;
  return <Icon icon={Circle} size={14} className="text-text-faint" aria-label="pending" />;
}

export function ProvisioningCard({ job }: { job: JobSnapshot }): React.JSX.Element {
  const failed = job.status === "failed";
  const statusLabel = failed ? "FAILED" : job.status === "queued" ? "QUEUED" : "RUNNING";
  const cardClass = cn(
    "bg-surface flex min-h-0 w-full flex-col overflow-hidden rounded-md border-2 border-dashed border-in-progress",
    failed && "border-destructive"
  );

  return (
    <section className={cardClass}>
      <header className="border-border-subtle flex h-9 items-center justify-between border-b px-3">
        <span className="text-text-secondary overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap">
          {job.branch}
        </span>
        <span className="text-text-muted text-xs">{statusLabel}</span>
      </header>
      <div className="scrollbar-hidden bg-terminal-bg flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          {ALL_STEPS.map((key) => {
            const step = job.steps.find((s) => s.key === key)!;
            const active = step.status === "in-progress";
            return (
              <div
                key={key}
                className={cn(
                  "text-text-muted flex items-center gap-3 text-sm [&>svg]:shrink-0",
                  active && "text-text-primary"
                )}
              >
                <StepIcon status={step.status} />
                <span>{STEP_LABELS[key]}</span>
              </div>
            );
          })}
        </div>
        {failed && job.failureMessage && (
          <div className="text-destructive text-xs whitespace-pre-wrap">
            {job.failureMessage.slice(0, 400)}
          </div>
        )}
        {failed && (
          <div className="mt-auto flex gap-2">
            <button
              type="button"
              className="bg-elevated text-text-primary rounded-sm px-3 py-2 text-sm"
              onClick={() => void api.newWorktree.retry({ jobId: job.id })}
            >
              Retry
            </button>
            <button
              type="button"
              className="bg-elevated text-destructive rounded-sm px-3 py-2 text-sm"
              onClick={() => void api.newWorktree.cancel({ jobId: job.id })}
            >
              Cancel & cleanup
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
