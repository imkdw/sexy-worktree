import { AlertTriangle, ArrowRight } from "lucide-react";
import { Icon } from "../icons/Icon";

export function PreflightNotice({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: "var(--spacing-3)",
        border: "1px solid var(--color-in-progress)",
        borderRadius: "var(--radius-md)",
        color: "var(--color-text-secondary)",
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--spacing-3)",
      }}
    >
      <Icon icon={AlertTriangle} size={16} />
      <div style={{ flex: 1 }}>
        <div style={{ color: "var(--color-text-primary)", fontWeight: 500, marginBottom: 4 }}>
          Setup Jira to enable
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          Add workspace URL, email, and API token in Settings.
        </div>
      </div>
      <button
        onClick={onOpenSettings}
        className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm"
      >
        Settings <Icon icon={ArrowRight} size={12} />
      </button>
    </div>
  );
}
