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
  if (status === "done") return <Icon icon={Check} size={14} aria-label="done" />;
  if (status === "in-progress")
    return <Icon icon={Loader2} size={14} className="text-in-progress animate-spin" />;
  if (status === "failed") return <Icon icon={XCircle} size={14} />;
  return <Icon icon={Circle} size={14} />;
}

export function ProvisioningCard({ job }: { job: JobSnapshot }): React.JSX.Element {
  const failed = job.status === "failed";
  return (
    <section
      className={cn(
        "border-in-progress bg-surface flex min-h-0 flex-col gap-3 rounded-md border-2 border-dashed p-4",
        failed && "border-destructive"
      )}
    >
      <div className="text-text-secondary flex items-center justify-between text-sm font-medium">
        <span>{job.branch}</span>
        {job.status === "queued" && <span className="text-text-muted text-xs">QUEUED</span>}
      </div>
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
            className="bg-elevated text-text-primary rounded-sm px-3 py-2 text-sm"
            onClick={() => void api.newWorktree.retry({ jobId: job.id })}
          >
            Retry
          </button>
          <button
            className="bg-elevated text-destructive rounded-sm px-3 py-2 text-sm"
            onClick={() => void api.newWorktree.cancel({ jobId: job.id })}
          >
            Cancel & cleanup
          </button>
        </div>
      )}
    </section>
  );
}
