import { Terminal as TerminalIcon } from "lucide-react";
import { Icon } from "../icons/Icon";

type NoTerminalProps = {
  mode: "overview" | "focus";
};

export function NoTerminal({ mode }: NoTerminalProps): React.JSX.Element {
  const copy =
    mode === "overview"
      ? {
          title: "No terminals open",
          body: "Select a worktree in the rail to open a terminal.",
        }
      : {
          title: "No terminal selected",
          body: "Select a worktree in the rail to open it here.",
        };

  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 text-center">
      <Icon icon={TerminalIcon} size={24} className="text-text-faint" />
      <div className="text-xl font-semibold">{copy.title}</div>
      <div className="text-text-secondary text-base">{copy.body}</div>
    </div>
  );
}
