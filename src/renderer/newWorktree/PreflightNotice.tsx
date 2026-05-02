import { AlertTriangle, ArrowRight } from "lucide-react";
import { Icon } from "../icons/Icon";

export function PreflightNotice({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}): React.JSX.Element {
  return (
    <div className="border-in-progress text-text-secondary flex items-start gap-3 rounded-md border p-3">
      <Icon icon={AlertTriangle} size={16} />
      <div className="flex-1">
        <div className="text-text-primary mb-1 font-medium">Setup Jira to enable</div>
        <div className="text-text-muted text-xs">
          Add workspace URL, email, and API token in Settings.
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="text-text-secondary hover:bg-elevated inline-flex items-center gap-1 rounded-sm px-3 py-2 text-sm"
      >
        Settings <Icon icon={ArrowRight} size={12} />
      </button>
    </div>
  );
}
