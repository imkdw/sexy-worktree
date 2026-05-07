import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "warning" | "progress";

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs?: number;
  action?: ToastAction;
};

type State = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
};

const Ctx = createContext<State | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const update = useCallback(
    (id: string, patch: Partial<Omit<Toast, "id">>) =>
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    []
  );
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((ts) => [...ts, { ...t, id }]);
      if (t.durationMs) setTimeout(() => dismiss(id), t.durationMs);
      return id;
    },
    [dismiss]
  );
  return <Ctx.Provider value={{ toasts, push, update, dismiss }}>{children}</Ctx.Provider>;
}

export function useToast(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be inside <ToastProvider>");
  return v;
}
