export function NoWorktree(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="text-text-muted">No worktrees in this repository yet.</div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("app:new-worktree"))}
        className="text-background bg-accent rounded-sm px-3 py-2 text-sm font-medium"
      >
        + New Worktree (⌘N)
      </button>
    </div>
  );
}
