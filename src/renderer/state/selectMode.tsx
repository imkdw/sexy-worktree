import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";

type State = {
  enabled: boolean;
  selected: Set<string>;
  lastToggledId: string | null;
  enter: () => void;
  exit: () => void;
  toggle: (id: string) => void;
  toggleRangeTo: (target: string, allIds: string[]) => void;
  clearSelected: () => void;
  selectAll: (ids: string[]) => void;
  toggleAll: (ids: string[]) => void;
};

const Ctx = createContext<State | null>(null);

type SelectModeSnapshot = Pick<State, "enabled" | "selected" | "lastToggledId">;

type Action =
  | { type: "enter" }
  | { type: "exit" }
  | { type: "toggle"; id: string }
  | { type: "toggleRangeTo"; target: string; allIds: string[] }
  | { type: "clearSelected" }
  | { type: "selectAll"; ids: string[] }
  | { type: "toggleAll"; ids: string[] };

const initialState: SelectModeSnapshot = {
  enabled: false,
  selected: new Set(),
  lastToggledId: null,
};

function toggleId(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function reducer(state: SelectModeSnapshot, action: Action): SelectModeSnapshot {
  switch (action.type) {
    case "enter":
      return { ...state, enabled: true };
    case "exit":
      return { enabled: false, selected: new Set(), lastToggledId: null };
    case "toggle":
      return {
        ...state,
        selected: toggleId(state.selected, action.id),
        lastToggledId: action.id,
      };
    case "toggleRangeTo": {
      const { target, allIds } = action;

      if (state.lastToggledId === null) {
        return {
          ...state,
          selected: toggleId(state.selected, target),
          lastToggledId: target,
        };
      }

      const anchorIndex = allIds.indexOf(state.lastToggledId);
      const targetIndex = allIds.indexOf(target);
      if (anchorIndex < 0 || targetIndex < 0) {
        return state;
      }

      const [lo, hi] = anchorIndex < targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex];
      const next = new Set(state.selected);
      for (const id of allIds.slice(lo, hi + 1)) next.add(id);

      return {
        ...state,
        selected: next,
        lastToggledId: target,
      };
    }
    case "clearSelected":
      return { ...state, selected: new Set(), lastToggledId: null };
    case "selectAll":
      return {
        ...state,
        selected: new Set(action.ids),
        lastToggledId: action.ids.at(-1) ?? null,
      };
    case "toggleAll": {
      if (action.ids.length === 0) {
        return { ...state, selected: new Set(), lastToggledId: null };
      }

      const allSelected = action.ids.every((id) => state.selected.has(id));
      if (allSelected) {
        return { ...state, selected: new Set(), lastToggledId: null };
      }

      return {
        ...state,
        selected: new Set(action.ids),
        lastToggledId: action.ids.at(-1) ?? null,
      };
    }
  }
}

export function SelectModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);

  const enter = useCallback(() => {
    dispatch({ type: "enter" });
  }, []);

  const exit = useCallback(() => {
    dispatch({ type: "exit" });
  }, []);

  const toggle = useCallback((id: string) => {
    dispatch({ type: "toggle", id });
  }, []);
  const toggleRangeTo = useCallback((target: string, allIds: string[]) => {
    dispatch({ type: "toggleRangeTo", target, allIds });
  }, []);
  const clearSelected = useCallback(() => {
    dispatch({ type: "clearSelected" });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    dispatch({ type: "selectAll", ids });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    dispatch({ type: "toggleAll", ids });
  }, []);

  return (
    <Ctx.Provider
      value={{
        enabled: state.enabled,
        selected: state.selected,
        lastToggledId: state.lastToggledId,
        enter,
        exit,
        toggle,
        toggleRangeTo,
        clearSelected,
        selectAll,
        toggleAll,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSelectMode(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSelectMode must be inside <SelectModeProvider>");
  return v;
}
