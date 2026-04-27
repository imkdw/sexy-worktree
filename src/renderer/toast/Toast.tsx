import { CheckCircle, AlertCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { Icon } from "../icons/Icon";
import { useToast, type ToastKind } from "../state/toast";
import type { LucideIcon } from "../icons/Icon";
import { cn } from "../lib/cn";

const ICON_FOR: Record<ToastKind, LucideIcon> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  progress: Loader2,
};

const VARIANT_BORDER: Record<ToastKind, string> = {
  success: "border-success",
  error: "border-destructive",
  warning: "border-in-progress",
  progress: "",
};

export function ToastLayer(): React.JSX.Element {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed right-4 bottom-4 z-[2000] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "w-toast border-border-subtle bg-surface flex items-start gap-3 rounded-md border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]",
            VARIANT_BORDER[t.kind]
          )}
        >
          <span className="mt-0.5 shrink-0">
            <Icon
              icon={ICON_FOR[t.kind]}
              size={16}
              {...(t.kind === "progress" ? { className: "animate-spin" } : {})}
            />
          </span>
          <div className="flex-1">
            <div className="text-text-primary text-sm font-medium">{t.title}</div>
            {t.description && <div className="text-text-muted mt-0.5 text-xs">{t.description}</div>}
          </div>
          <button className="text-text-muted" onClick={() => dismiss(t.id)}>
            <Icon icon={X} size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
