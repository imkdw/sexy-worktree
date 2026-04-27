import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Mode = "overview" | "focus";

type ModeState = {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggle: () => void;
};

const Ctx = createContext<ModeState | null>(null);

export function ModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("overview");
  const toggle = useCallback(() => setMode((m) => (m === "overview" ? "focus" : "overview")), []);
  return <Ctx.Provider value={{ mode, setMode, toggle }}>{children}</Ctx.Provider>;
}

export function useMode(): ModeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMode must be inside <ModeProvider>");
  return v;
}
