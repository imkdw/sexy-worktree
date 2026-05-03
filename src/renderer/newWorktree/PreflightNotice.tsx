import { AlertTriangle, ArrowRight } from "lucide-react";
import { Icon } from "../icons/Icon";

export function PreflightNotice({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}): React.JSX.Element {
  return (
    <div className="border-in-progress text-text-secondary flex items-start gap-4 rounded-md border p-4">
      <Icon icon={AlertTriangle} size={16} />
      <div className="flex-1">
        <div className="text-text-primary mb-1 font-medium">Setup Jira to enable</div>
        <div className="text-text-muted text-sm">
          Add workspace URL, email, and API token in Settings.
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="text-text-secondary hover:bg-elevated inline-flex items-center gap-2 rounded-sm px-4 py-3 text-base"
      >
        Settings <Icon icon={ArrowRight} size={14} />
      </button>
    </div>
  );
}
