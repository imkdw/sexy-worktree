export type JobId = string;

export type StepKey =
  | "fetch"
  | "worktree-add"
  | "files-copy"
  | "clonefile"
  | "install"
  | "init-commands";

export const ALL_STEPS: StepKey[] = [
  "fetch",
  "worktree-add",
  "files-copy",
  "clonefile",
  "install",
  "init-commands",
];

export type StepStatus = "pending" | "in-progress" | "done" | "failed";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type JobSnapshot = {
  id: JobId;
  repoId: number;
  branch: string;
  worktreePath: string;
  status: JobStatus;
  steps: { key: StepKey; status: StepStatus; message?: string }[];
  failedStep: StepKey | null;
  failureMessage: string | null;
  createdAt: number;
};

export type JobEvent =
  | { kind: "created"; job: JobSnapshot }
  | { kind: "updated"; job: JobSnapshot }
  | { kind: "completed"; job: JobSnapshot };
