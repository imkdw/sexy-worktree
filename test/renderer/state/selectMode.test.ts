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

  it("초기 상태는 선택 모드가 꺼져 있고 selected 비어있고 lastToggledId는 null", () => {
    active = mountHook();
    expect(active.hook.current.enabled).toBe(false);
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });

  it("enter는 선택 모드를 켜고 기존 선택 상태는 변경하지 않음", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.enter());
    expect(active.hook.current.enabled).toBe(true);
    expect(active.hook.current.selected.has("a")).toBe(true);
    expect(active.hook.current.lastToggledId).toBe("a");
  });

  it("exit는 선택 모드를 끄고 selected와 lastToggledId를 모두 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.enter());
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.exit());
    expect(active.hook.current.enabled).toBe(false);
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });

  it("clearSelected는 선택 모드는 유지하고 selected와 lastToggledId만 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.enter());
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.clearSelected());
    expect(active.hook.current.enabled).toBe(true);
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });

  it("selectAll은 전달받은 id 목록으로 selected를 교체하고 anchor를 마지막 id로 설정", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("stale"));
    act(() => active!.hook.current.selectAll(["a", "b"]));
    expect([...active.hook.current.selected]).toEqual(["a", "b"]);
    expect(active.hook.current.lastToggledId).toBe("b");
  });

  it("selectAll은 빈 목록이면 selected와 anchor를 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.selectAll([]));
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });

  it("public hook state는 old clear API를 노출하지 않음", () => {
    active = mountHook();
    const publicState = active.hook.current as Record<string, unknown>;
    expect(publicState.clear).toBeUndefined();
  });

  it("toggleAll은 일부만 선택된 경우 전달받은 모든 id를 선택", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.toggleAll(["a", "b", "c"]));
    expect([...active.hook.current.selected]).toEqual(["a", "b", "c"]);
    expect(active.hook.current.lastToggledId).toBe("c");
  });

  it("toggleAll은 모두 선택된 경우 selected와 anchor를 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.selectAll(["a", "b"]));
    act(() => active!.hook.current.toggleAll(["a", "b"]));
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });

  it("toggleAll은 빈 목록이면 selected와 anchor를 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.toggleAll([]));
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

  it("clearSelected는 selected와 lastToggledId 모두 리셋", () => {
    active = mountHook();
    act(() => active!.hook.current.toggle("a"));
    act(() => active!.hook.current.toggle("b"));
    act(() => active!.hook.current.clearSelected());
    expect(active.hook.current.selected.size).toBe(0);
    expect(active.hook.current.lastToggledId).toBeNull();
  });
});
