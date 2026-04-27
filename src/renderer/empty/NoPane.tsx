import { Plus } from "lucide-react";
import { Icon } from "../icons/Icon";

export function NoPane({ onNewPane }: { onNewPane: () => void }): React.JSX.Element {
  return (
    <div className="text-text-faint flex flex-1 items-center justify-center">
      <button
        onClick={onNewPane}
        className="text-text-secondary inline-flex items-center gap-2 rounded-sm px-3 py-2 text-sm"
      >
        <Icon icon={Plus} size={14} /> New pane (⌘D)
      </button>
    </div>
  );
}
