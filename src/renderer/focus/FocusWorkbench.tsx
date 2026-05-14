import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { FileDiff, FileText, RefreshCw, Save } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MultiFileDiff, Virtualizer, type MultiFileDiffProps } from "@pierre/diffs/react";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { cn } from "../lib/cn";
import { useFocusWorkbench } from "../state/focusWorkbench";
import { useToast } from "../state/toast";
import { Tooltip } from "../ui";
import type { WorktreeFileError } from "@shared/ipc";
import { highlightSource, type HighlightTokenKind } from "./syntaxHighlight";

function describeFileError(error: WorktreeFileError): string {
  switch (error.kind) {
    case "git-failed":
      return error.stderr || "Git command failed";
    case "outside-worktree":
      return "Path is outside the worktree";
    case "not-found":
      return "File was not found";
    case "not-a-file":
      return "Path is not a regular file";
    case "binary":
      return "Binary files are not editable here";
    case "read-failed":
    case "write-failed":
      return error.message;
    default:
      return "Unknown file error";
  }
}

const diffOptions = {
  diffStyle: "split",
  diffIndicators: "classic",
  hunkSeparators: "line-info",
  lineDiffType: "word-alt",
  overflow: "wrap",
  theme: "pierre-dark",
  themeType: "dark",
  unsafeCSS: `
    :host {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
    }
  `,
} satisfies NonNullable<MultiFileDiffProps<undefined>["options"]>;

const HIGHLIGHT_CLASS = {
  comment: "text-text-muted",
  keyword: "text-accent",
  number: "text-in-progress",
  plain: "text-text-primary",
  string: "text-success",
  type: "text-text-secondary",
} satisfies Record<HighlightTokenKind, string>;

export function FocusWorkbench(): React.JSX.Element {
  const { activeWorktreePath, selected } = useFocusWorkbench();

  return (
    <section className="border-border-subtle bg-surface flex min-h-0 min-w-0 flex-1 basis-1/2 flex-col overflow-hidden rounded-md border">
      {!activeWorktreePath ? (
        <EmptyWorkbench title="No worktree selected" />
      ) : !selected ? (
        <EmptyWorkbench title="No file selected" />
      ) : selected.view === "diff" ? (
        <DiffView worktreePath={activeWorktreePath} relativePath={selected.relativePath} />
      ) : (
        <EditorView worktreePath={activeWorktreePath} relativePath={selected.relativePath} />
      )}
    </section>
  );
}

function EmptyWorkbench({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="text-text-muted flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon icon={FileText} size={20} />
      <div className="text-text-secondary text-sm font-medium">{title}</div>
    </div>
  );
}

function WorkbenchHeader({
  icon,
  title,
  meta,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <header className="border-border-subtle flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <Icon icon={icon} size={14} />
      <span className="text-text-secondary min-w-0 flex-1 truncate text-sm font-medium">
        {title}
      </span>
      {meta && <span className="text-text-muted shrink-0 text-xs">{meta}</span>}
      {children}
    </header>
  );
}

function EditorView({
  worktreePath,
  relativePath,
}: {
  worktreePath: string;
  relativePath: string;
}): React.JSX.Element {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useFocusWorkbench();
  const toast = useToast();
  const dirty = content !== savedContent;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void api.worktree.readFile({ worktreePath, relativePath }).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setError(describeFileError(result.error));
        setContent("");
        setSavedContent("");
        return;
      }
      setContent(result.value.content);
      setSavedContent(result.value.content);
    });
    return () => {
      alive = false;
    };
  }, [worktreePath, relativePath]);

  async function save(): Promise<void> {
    if (!dirty || saving) return;
    setSaving(true);
    const result = await api.worktree.writeFile({ worktreePath, relativePath, content });
    setSaving(false);
    if (!result.ok) {
      const message = describeFileError(result.error);
      setError(message);
      toast.push({
        kind: "error",
        title: "Cannot save file",
        description: message,
        durationMs: 5000,
      });
      return;
    }
    setSavedContent(result.value.content);
    setError(null);
    await refresh();
    toast.push({
      kind: "success",
      title: "File saved",
      description: relativePath,
      durationMs: 2500,
    });
  }

  return (
    <>
      <WorkbenchHeader
        icon={FileText}
        title={relativePath}
        meta={dirty ? "modified" : loading ? "loading" : "saved"}
      >
        <Tooltip label="Reload file">
          <button
            aria-label="Reload file"
            className="text-text-muted hover:bg-elevated hover:text-text-primary inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-150"
            disabled={loading}
            onClick={() => {
              setSavedContent("");
              setContent("");
              void api.worktree.readFile({ worktreePath, relativePath }).then((result) => {
                if (!result.ok) {
                  setError(describeFileError(result.error));
                  return;
                }
                setContent(result.value.content);
                setSavedContent(result.value.content);
                setError(null);
              });
            }}
          >
            <Icon icon={RefreshCw} size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </Tooltip>
        <Tooltip label="Save file">
          <button
            aria-label="Save file"
            className="text-text-muted hover:bg-elevated hover:text-text-primary inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            <Icon icon={Save} size={14} />
          </button>
        </Tooltip>
      </WorkbenchHeader>
      {error && (
        <div className="text-destructive border-border-subtle border-b px-3 py-2 text-xs">
          {error}
        </div>
      )}
      <HighlightedTextarea
        relativePath={relativePath}
        value={loading ? "Loading..." : content}
        loading={loading}
        onChange={setContent}
      />
    </>
  );
}

function HighlightedTextarea({
  relativePath,
  value,
  loading,
  onChange,
}: {
  relativePath: string;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const highlightRef = useRef<HTMLPreElement>(null);
  const segments = useMemo(
    () =>
      loading ? [{ kind: "plain" as const, text: value }] : highlightSource(value, relativePath),
    [loading, relativePath, value]
  );

  function syncHighlightScroll(event: UIEvent<HTMLTextAreaElement>): void {
    const highlight = highlightRef.current;
    if (!highlight) return;
    highlight.scrollTop = event.currentTarget.scrollTop;
    highlight.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div className="bg-terminal-bg relative min-h-0 flex-1 overflow-hidden">
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className={cn(
          "code-editor-layer scrollbar-terminal pointer-events-none absolute inset-0 overflow-auto p-3 font-mono text-sm whitespace-pre",
          loading ? "text-text-muted" : "text-text-primary"
        )}
      >
        <code>
          {segments.map((segment, index) =>
            segment.kind === "plain" ? (
              <span key={`${segment.kind}:${index}`}>{segment.text}</span>
            ) : (
              <span
                key={`${segment.kind}:${index}`}
                className={HIGHLIGHT_CLASS[segment.kind]}
                data-token-kind={segment.kind}
              >
                {segment.text}
              </span>
            )
          )}
          {value.endsWith("\n") ? " " : null}
        </code>
      </pre>
      <textarea
        aria-label={`Edit ${relativePath}`}
        className="code-editor-input code-editor-layer scrollbar-terminal absolute inset-0 resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-sm outline-none disabled:cursor-wait"
        disabled={loading}
        spellCheck={false}
        value={value}
        wrap="off"
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncHighlightScroll}
      />
    </div>
  );
}

function DiffView({
  worktreePath,
  relativePath,
}: {
  worktreePath: string;
  relativePath: string;
}): React.JSX.Element {
  const [diff, setDiff] = useState<{
    originalPath: string | null;
    status: string;
    oldContent: string;
    newContent: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectFile } = useFocusWorkbench();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setDiff(null);
    void api.worktree.fileDiff({ worktreePath, relativePath }).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setError(describeFileError(result.error));
        return;
      }
      setDiff({
        originalPath: result.value.originalPath,
        status: result.value.status,
        oldContent: result.value.oldContent,
        newContent: result.value.newContent,
      });
    });
    return () => {
      alive = false;
    };
  }, [worktreePath, relativePath]);

  const oldFile = useMemo(
    () => ({
      name: diff?.originalPath ?? relativePath,
      contents: diff?.oldContent ?? "",
    }),
    [diff?.oldContent, diff?.originalPath, relativePath]
  );
  const newFile = useMemo(
    () => ({
      name: relativePath,
      contents: diff?.newContent ?? "",
    }),
    [diff?.newContent, relativePath]
  );
  const hasRenderedDiff = !!diff && diff.oldContent !== diff.newContent;

  return (
    <>
      <WorkbenchHeader
        icon={FileDiff}
        title={relativePath}
        meta={loading ? "loading" : (diff?.status ?? "diff")}
      >
        <Tooltip label="Open editor">
          <button
            aria-label="Open file editor"
            className="text-text-muted hover:bg-elevated hover:text-text-primary inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-150"
            onClick={() => selectFile(relativePath)}
          >
            <Icon icon={FileText} size={14} />
          </button>
        </Tooltip>
      </WorkbenchHeader>
      {error && (
        <div className="text-destructive border-border-subtle border-b px-3 py-2 text-xs">
          {error}
        </div>
      )}
      {loading ? (
        <div className="text-text-muted flex min-h-0 flex-1 items-center justify-center text-sm">
          Loading diff...
        </div>
      ) : hasRenderedDiff ? (
        <Virtualizer
          className="scrollbar-hidden min-h-0 flex-1 overflow-auto"
          contentClassName="p-3"
        >
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={diffOptions}
            disableWorkerPool={true}
          />
        </Virtualizer>
      ) : (
        <div className="text-text-muted flex min-h-0 flex-1 items-center justify-center text-sm">
          No changes in this file.
        </div>
      )}
    </>
  );
}
