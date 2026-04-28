// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRailWidth, type UseRailWidth } from "../useRailWidth";

const STORAGE_KEY = "sexy-worktree:rail-width";

interface HookHandle {
  current: UseRailWidth;
}

interface MountResult {
  hook: HookHandle;
  unmount: () => void;
}

function mountHook(): MountResult {
  const hook: HookHandle = { current: undefined as unknown as UseRailWidth };
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;

  function HookHost(): null {
    hook.current = useRailWidth();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(createElement(HookHost));
  });

  return {
    hook,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useRailWidth", () => {
  let active: MountResult | null = null;

  beforeEach(() => {
    localStorage.clear();
    active = null;
  });

  afterEach(() => {
    if (active) {
      active.unmount();
      active = null;
    }
  });

  it("초기값 — localStorage 비어있음 → DEFAULT(200)", () => {
    active = mountHook();
    expect(active.hook.current.width).toBe(200);
  });

  it("초기값 — 유효한 저장값을 그대로 사용한다", () => {
    localStorage.setItem(STORAGE_KEY, "300");
    active = mountHook();
    expect(active.hook.current.width).toBe(300);
  });

  it("초기값 — MIN 미만 값은 80 으로 clamp 된다", () => {
    localStorage.setItem(STORAGE_KEY, "20");
    active = mountHook();
    expect(active.hook.current.width).toBe(80);
  });

  it("초기값 — MAX 초과 값은 480 으로 clamp 된다", () => {
    localStorage.setItem(STORAGE_KEY, "9999");
    active = mountHook();
    expect(active.hook.current.width).toBe(480);
  });

  it("초기값 — 손상된(NaN) 값은 DEFAULT(200) 로 복구된다", () => {
    localStorage.setItem(STORAGE_KEY, "abc");
    active = mountHook();
    expect(active.hook.current.width).toBe(200);
  });

  it("초기값 — 음수 값은 MIN(80) 으로 clamp 된다", () => {
    localStorage.setItem(STORAGE_KEY, "-50");
    active = mountHook();
    expect(active.hook.current.width).toBe(80);
  });

  it("toggleCollapsed — collapsed 가 토글되며 width 는 보존된다", () => {
    active = mountHook();
    const initialWidth = active.hook.current.width;
    expect(active.hook.current.collapsed).toBe(false);

    act(() => {
      active!.hook.current.toggleCollapsed();
    });
    expect(active.hook.current.collapsed).toBe(true);
    expect(active.hook.current.width).toBe(initialWidth);

    act(() => {
      active!.hook.current.toggleCollapsed();
    });
    expect(active.hook.current.collapsed).toBe(false);
    expect(active.hook.current.width).toBe(initialWidth);
  });
});
