type StatusBarProps = {
  text?: string;
};

export function StatusBar({ text = "Ready" }: StatusBarProps): React.JSX.Element {
  return (
    <div className="border-border-subtle bg-background text-text-faint flex h-[var(--statusbar-h)] items-center border-t px-3 text-xs">
      {text}
    </div>
  );
}
