import { GitBranch, Ticket, type LucideIcon } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";

export type WorktreeMethod = "direct" | "jira";

type Method = {
  value: WorktreeMethod;
  title: string;
  description: string;
  icon: LucideIcon;
};

const METHODS: Method[] = [
  {
    value: "direct",
    title: "Direct",
    description: "Type an exact branch name.",
    icon: GitBranch,
  },
  {
    value: "jira",
    title: "From Jira",
    description: "Resolve a ticket into a branch.",
    icon: Ticket,
  },
];

type Props = {
  value: WorktreeMethod;
  onChange: (value: WorktreeMethod) => void;
  disabled?: boolean;
};

export function WorktreeMethodSelector({
  value,
  onChange,
  disabled = false,
}: Props): React.JSX.Element {
  return (
    <div
      className="border-border-subtle bg-background grid grid-cols-2 gap-3 rounded-md border p-3"
      aria-label="Worktree creation method"
    >
      {METHODS.map((method) => {
        const selected = method.value === value;
        return (
          <button
            key={method.value}
            type="button"
            aria-label={method.title}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(method.value)}
            className={cn(
              "border-border-subtle text-text-secondary hover:bg-elevated hover:text-text-primary focus:outline-accent-soft flex h-full flex-col items-start gap-3 rounded-md border p-6 text-left transition-colors duration-150 focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40",
              selected &&
                "border-accent bg-elevated text-text-primary outline-accent-soft outline-2"
            )}
          >
            <span className="flex items-center gap-2 text-base font-medium">
              <Icon icon={method.icon} size={16} />
              {method.title}
            </span>
            <span className="text-text-muted text-sm">{method.description}</span>
          </button>
        );
      })}
    </div>
  );
}
