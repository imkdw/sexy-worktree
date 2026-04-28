import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "sexy-worktree:rail-width";
const MIN = 80;
const MAX = 480;
const DEFAULT = 200;
const DRAG_THRESHOLD_PX = 3;
const COLLAPSED_PX = 48;

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function readStored(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT;
  return clamp(n, MIN, MAX);
}

export interface UseRailWidth {
  width: number;
  collapsed: boolean;
  isDragging: boolean;
  toggleCollapsed: () => void;
  startDrag: (e: React.MouseEvent, asideEl: HTMLElement) => void;
}

export function useRailWidth(): UseRailWidth {
  const [width, setWidth] = useState<number>(() => readStored());
  const [collapsed, setCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Holds the latest width during an active drag so mouseup can read the
  // final value without depending on (stale) state closures.
  const widthRef = useRef<number>(width);

  // Keep CSS var synced to React state for non-drag changes (mount,
  // collapse toggle, post-drag persisted width). During an active drag the
  // mousemove handler writes the variable directly; React state does not
  // change until mouseup, so this effect does not fight in-flight drags.
  useEffect(() => {
    const target = collapsed ? COLLAPSED_PX : width;
    document.documentElement.style.setProperty("--rail-w", `${target}px`);
  }, [width, collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const startDrag = useCallback(
    (e: React.MouseEvent, asideEl: HTMLElement) => {
      e.preventDefault();

      const startX = e.clientX;
      const startWidth = width;
      const asideLeft = asideEl.getBoundingClientRect().left;
      let thresholdCrossed = false;

      widthRef.current = startWidth;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent): void => {
        if (!thresholdCrossed && Math.abs(ev.clientX - startX) >= DRAG_THRESHOLD_PX) {
          thresholdCrossed = true;
          setIsDragging(true);
          if (collapsed) {
            setCollapsed(false);
          }
        }
        if (!thresholdCrossed) return;

        const next = clamp(ev.clientX - asideLeft, MIN, MAX);
        document.documentElement.style.setProperty("--rail-w", `${next}px`);
        widthRef.current = next;
      };

      const onUp = (): void => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);

        if (thresholdCrossed) {
          const final = Math.round(widthRef.current);
          setWidth(final);
          setIsDragging(false);
          localStorage.setItem(STORAGE_KEY, String(final));
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp, { once: true });
    },
    [width, collapsed]
  );

  return { width, collapsed, isDragging, toggleCollapsed, startDrag };
}
