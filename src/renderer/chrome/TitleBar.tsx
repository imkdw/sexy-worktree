export function TitleBar(): React.JSX.Element {
  return (
    <div className="border-border-subtle bg-background flex h-[var(--titlebar-h)] items-center justify-center border-b select-none [-webkit-app-region:drag]">
      <span className="text-text-muted text-sm font-medium">Sexy Worktree</span>
    </div>
  );
}
