export type DeleteWorktreeTarget = {
  worktreePath: string;
  branch: string | null;
};

export type DeleteWorktreeItemStatus =
  | "pending"
  | "deleting"
  | "deleted"
  | "failed"
  | "cancelled";

export type DeleteWorktreeJobStatus = "running" | "done" | "failed" | "cancelled";

export type DeleteWorktreeJobItem = DeleteWorktreeTarget & {
  status: DeleteWorktreeItemStatus;
  errorMessage: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

export type DeleteWorktreeJobSnapshot = {
  id: string;
  repoId: number;
  repoPath: string;
  status: DeleteWorktreeJobStatus;
  items: DeleteWorktreeJobItem[];
  cancelRequested: boolean;
  createdAt: number;
  finishedAt: number | null;
};

export type DeleteWorktreeJobEvent =
  | { kind: "created"; job: DeleteWorktreeJobSnapshot }
  | { kind: "updated"; job: DeleteWorktreeJobSnapshot }
  | { kind: "completed"; job: DeleteWorktreeJobSnapshot }
  | { kind: "dismissed"; jobId: string };

export function isDeleteWorktreeJobTerminal(status: DeleteWorktreeJobStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}
