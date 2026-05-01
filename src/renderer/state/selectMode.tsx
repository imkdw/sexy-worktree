import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type State = {
  selected: Set<string>;
  lastToggledId: string | null;
  toggle: (id: string) => void;
  toggleRangeTo: (target: string, allIds: string[]) => void;
  clear: () => void;
};

const Ctx = createContext<State | null>(null);

export function SelectModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastToggledId, setLastToggledId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastToggledId(id);
  }, []);
  const toggleRangeTo = useCallback((target: string, allIds: string[]) => {
    setLastToggledId((anchor) => {
      if (anchor === null) {
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(target)) next.delete(target);
          else next.add(target);
          return next;
        });
        return target;
      }
      const a = allIds.indexOf(anchor);
      const b = allIds.indexOf(target);
      if (a < 0 || b < 0) return anchor;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const ids = allIds.slice(lo, hi + 1);
      setSelected((s) => {
        const next = new Set(s);
        for (const id of ids) next.add(id);
        return next;
      });
      return target;
    });
  }, []);
  const clear = useCallback(() => {
    setSelected(new Set());
    setLastToggledId(null);
  }, []);

  return (
    <Ctx.Provider value={{ selected, lastToggledId, toggle, toggleRangeTo, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSelectMode(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSelectMode must be inside <SelectModeProvider>");
  return v;
}
