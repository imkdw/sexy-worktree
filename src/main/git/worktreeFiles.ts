import { lstat, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, posix } from "node:path";
import { ok, err, type Result } from "@shared/result";
import type {
  WorktreeFileChange,
  WorktreeFileDiffStatus,
  WorktreeFileEntry,
  WorktreeFileError,
  WorktreeFileStatus,
} from "@shared/ipc";
import { gitExec, gitExecBuffer, type GitError } from "./exec";

const GIT_TIMEOUT_MS = 10_000;

function gitFailed(error: GitError): WorktreeFileError {
  return { kind: "git-failed", stderr: error.stderr || error.stdout };
}

function normalizeRelativePath(input: string): Result<string, WorktreeFileError> {
  if (input.includes("\0") || isAbsolute(input)) {
    return err({ kind: "outside-worktree", path: input });
  }
  const normalized = posix.normalize(input.replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    posix.isAbsolute(normalized)
  ) {
    return err({ kind: "outside-worktree", path: input });
  }
  return ok(normalized);
}

function resolveInsideWorktree(
  worktreePath: string,
  relativePath: string
): Result<{ root: string; target: string; relativePath: string }, WorktreeFileError> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.ok) return normalized;

  const root = resolve(worktreePath);
  const target = resolve(root, ...normalized.value.split("/"));
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    return err({ kind: "outside-worktree", path: relativePath });
  }
  return ok({ root, target, relativePath: normalized.value });
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function statusFromPorcelain(indexStatus: string, workingTreeStatus: string): WorktreeFileStatus {
  const pair = `${indexStatus}${workingTreeStatus}`;
  if (pair === "??") return "untracked";
  if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(pair)) return "conflicted";
  if (indexStatus === "R" || workingTreeStatus === "R") return "renamed";
  if (indexStatus === "A" || workingTreeStatus === "A") return "added";
  if (indexStatus === "D" || workingTreeStatus === "D") return "deleted";
  return "modified";
}

export function parseGitStatusPorcelain(stdout: string): WorktreeFileChange[] {
  const records = stdout.split("\0").filter(Boolean);
  const changes: WorktreeFileChange[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const indexStatus = record[0] ?? " ";
    const workingTreeStatus = record[1] ?? " ";
    const relativePath = record.slice(3);
    let originalPath: string | null = null;

    if (
      indexStatus === "R" ||
      workingTreeStatus === "R" ||
      indexStatus === "C" ||
      workingTreeStatus === "C"
    ) {
      originalPath = records[index + 1] ?? null;
      index += 1;
    }

    changes.push({
      relativePath,
      originalPath,
      status: statusFromPorcelain(indexStatus, workingTreeStatus),
      indexStatus,
      workingTreeStatus,
    });
  }

  return changes;
}

function buildFileEntries(paths: string[]): WorktreeFileEntry[] {
  const entries = new Map<string, WorktreeFileEntry>();

  for (const path of paths) {
    const normalized = normalizeRelativePath(path);
    if (!normalized.ok) continue;
    const parts = normalized.value.split("/");
    let current = "";

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      if (!name) continue;
      current = current ? `${current}/${name}` : name;
      const isFile = index === parts.length - 1;
      if (!entries.has(current)) {
        entries.set(current, {
          relativePath: current,
          name,
          kind: isFile ? "file" : "directory",
          depth: index,
        });
      }
    }
  }

  return [...entries.values()].sort((a, b) => {
    const pathCompare = a.relativePath.localeCompare(b.relativePath);
    if (pathCompare !== 0) return pathCompare;
    return a.kind.localeCompare(b.kind);
  });
}

export async function listWorktreeFiles(
  worktreePath: string
): Promise<Result<WorktreeFileEntry[], WorktreeFileError>> {
  const r = await gitExec(
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--directory",
      "--no-empty-directory",
      "--deduplicate",
      "-z",
    ],
    {
      cwd: worktreePath,
      timeoutMs: GIT_TIMEOUT_MS,
    }
  );
  if (!r.ok) return err(gitFailed(r.error));

  const paths = r.value.split("\0").filter(Boolean);
  return ok(buildFileEntries(paths));
}

export async function getWorktreeStatus(
  worktreePath: string
): Promise<Result<WorktreeFileChange[], WorktreeFileError>> {
  const r = await gitExec(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], {
    cwd: worktreePath,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (!r.ok) return err(gitFailed(r.error));
  return ok(parseGitStatusPorcelain(r.value));
}

export async function readWorktreeFile(
  worktreePath: string,
  relativePath: string
): Promise<Result<{ relativePath: string; content: string }, WorktreeFileError>> {
  const resolved = resolveInsideWorktree(worktreePath, relativePath);
  if (!resolved.ok) return resolved;

  try {
    const stat = await lstat(resolved.value.target);
    if (!stat.isFile()) return err({ kind: "not-a-file", path: resolved.value.relativePath });
  } catch {
    return err({ kind: "not-found", path: resolved.value.relativePath });
  }

  try {
    const buffer = await readFile(resolved.value.target);
    if (isBinaryBuffer(buffer)) return err({ kind: "binary", path: resolved.value.relativePath });
    return ok({ relativePath: resolved.value.relativePath, content: buffer.toString("utf8") });
  } catch (error) {
    return err({
      kind: "read-failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function writeWorktreeFile(
  worktreePath: string,
  relativePath: string,
  content: string
): Promise<Result<{ relativePath: string; content: string }, WorktreeFileError>> {
  const resolved = resolveInsideWorktree(worktreePath, relativePath);
  if (!resolved.ok) return resolved;
  if (content.includes("\0")) return err({ kind: "binary", path: resolved.value.relativePath });

  try {
    const stat = await lstat(resolved.value.target);
    if (!stat.isFile()) return err({ kind: "not-a-file", path: resolved.value.relativePath });
  } catch {
    return err({ kind: "not-found", path: resolved.value.relativePath });
  }

  try {
    await writeFile(resolved.value.target, content, "utf8");
    return ok({ relativePath: resolved.value.relativePath, content });
  } catch (error) {
    return err({
      kind: "write-failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readHeadBlob(
  worktreePath: string,
  relativePath: string
): Promise<Result<string, WorktreeFileError>> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.ok) return normalized;

  const r = await gitExecBuffer(["show", `HEAD:${normalized.value}`], {
    cwd: worktreePath,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (!r.ok) {
    return ok("");
  }
  if (isBinaryBuffer(r.value)) return err({ kind: "binary", path: normalized.value });
  return ok(r.value.toString("utf8"));
}

export async function getWorktreeFileDiff(
  worktreePath: string,
  relativePath: string
): Promise<
  Result<
    {
      relativePath: string;
      originalPath: string | null;
      status: WorktreeFileDiffStatus;
      oldContent: string;
      newContent: string;
    },
    WorktreeFileError
  >
> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.ok) return normalized;

  const status = await getWorktreeStatus(worktreePath);
  if (!status.ok) return status;
  const change =
    status.value.find((item) => item.relativePath === normalized.value) ??
    status.value.find((item) => item.originalPath === normalized.value) ??
    null;

  const oldPath = change?.originalPath ?? normalized.value;
  const oldContent =
    change?.status === "added" || change?.status === "untracked"
      ? ok("")
      : await readHeadBlob(worktreePath, oldPath);
  if (!oldContent.ok) return oldContent;

  const newContent =
    change?.status === "deleted"
      ? ok({ relativePath: normalized.value, content: "" })
      : await readWorktreeFile(worktreePath, normalized.value);
  if (!newContent.ok) return newContent;

  return ok({
    relativePath: normalized.value,
    originalPath: change?.originalPath ?? null,
    status: change?.status ?? "unchanged",
    oldContent: oldContent.value,
    newContent: newContent.value.content,
  });
}
