import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type State = {
  active: boolean;
  selected: Set<string>;
  enter: () => void;
  exit: () => void;
  toggle: (id: string) => void;
  toggleRange: (anchor: string, target: string, allIds: string[]) => void;
  clear: () => void;
};

const Ctx = createContext<State | null>(null);

export function SelectModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const enter = useCallback(() => setActive(true), []);
  const exit = useCallback(() => {
    setActive(false);
    setSelected(new Set());
  }, []);
  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleRange = useCallback((anchor: string, target: string, allIds: string[]) => {
    const a = allIds.indexOf(anchor);
    const b = allIds.indexOf(target);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const ids = allIds.slice(lo, hi + 1);
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);

  return (
    <Ctx.Provider value={{ active, selected, enter, exit, toggle, toggleRange, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSelectMode(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSelectMode must be inside <SelectModeProvider>");
  return v;
}
