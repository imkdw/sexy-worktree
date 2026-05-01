// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectModeProvider, useSelectMode } from "@renderer/state/selectMode";

type State = ReturnType<typeof useSelectMode>;

interface HookHandle {
  current: State;
}

interface MountResult {
  hook: HookHandle;
  unmount: () => void;
}

function mountHook(): MountResult {
  const hook: HookHandle = { current: undefined as unknown as State };
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;

  function HookHost(): null {
    hook.current = useSelectMode();
    return null;
  }
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return createElement(SelectModeProvider, null, children);
  }

  act(() => {
    root = createRoot(container);
    root.render(createElement(Wrapper, null, createElement(HookHost)));
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

describe("selectMode", () => {
  let active: MountResult | null = null;
  beforeEach(() => {
    active = null;
  });
  afterEach(() => {
    if (active) {
      active.unmount();
      active = null;
    }
  });

  it("초기 상태는 selected 비어있고 lastToggledId는 null", () => {
    active = mountHook();
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });

  it("toggle은 selected에 추가/제거하고 lastToggledId를 항상 갱신", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    expect(active.hook.current.selected.has("a")).toBe(true);
    expect(active.hook.current.lastToggledId).toBe("a");

    act(() => active!.hook.current.toggle("b"));
    expect(active.hook.current.selected.has("b")).toBe(true);
    expect(active.hook.current.lastToggledId).toBe("b");

    act(() => active!.hook.current.toggle("a"));
    expect(active.hook.current.selected.has("a")).toBe(false);
    expect(active.hook.current.lastToggledId).toBe("a");
  });

  it("toggleRangeTo는 lastToggledId가 null이면 단순 토글", () => {
    active = mountHook();
    act(() => active!.hook.current.toggleRangeTo("c", ["a", "b", "c", "d"]));
    expect([...active.hook.current.selected]).toEqual(["c"]);
    expect(active.hook.current.lastToggledId).toBe("c");
  });

  it("toggleRangeTo는 anchor부터 target까지 추가하고 lastToggledId를 target으로 갱신", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.toggleRangeTo("c", ["a", "b", "c", "d"]));
    expect(active.hook.current.selected.has("a")).toBe(true);
    expect(active.hook.current.selected.has("b")).toBe(true);
    expect(active.hook.current.selected.has("c")).toBe(true);
    expect(active.hook.current.selected.has("d")).toBe(false);
    expect(active.hook.current.lastToggledId).toBe("c");
  });

  it("toggleRangeTo는 anchor가 target보다 뒤에 있어도 동작", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("d"));
    act(() => active!.hook.current.toggleRangeTo("b", ["a", "b", "c", "d"]));
    expect(active.hook.current.selected.has("b")).toBe(true);
    expect(active.hook.current.selected.has("c")).toBe(true);
    expect(active.hook.current.selected.has("d")).toBe(true);
    expect(active.hook.current.selected.has("a")).toBe(false);
    expect(active.hook.current.lastToggledId).toBe("b");
  });

  it("clear는 selected와 lastToggledId 모두 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.toggle("b"));
    act(() => active!.hook.current.clear());
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });
});
