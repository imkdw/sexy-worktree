// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("ToastLayer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function findButton(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (el) => el.textContent === label
    );
  }

  it("renders a toast action button, invokes the action, and dismisses the toast", async () => {
    vi.resetModules();

    const [{ ToastProvider, useToast }, { ToastLayer }] = await Promise.all([
      import("@renderer/state/toast"),
      import("@renderer/toast/Toast"),
    ]);
    const action = vi.fn();

    function Probe(): React.JSX.Element {
      const { push } = useToast();

      useEffect(() => {
        push({
          kind: "warning",
          title: "Sexy Worktree v1.0.1 available",
          description: "Download the DMG to install it.",
          action: { label: "Download update", onClick: action },
        });
      }, [push]);

      return createElement("div");
    }

    if (!container) throw new Error("container not initialized");
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          ToastProvider as ComponentType<{ children: ReactNode }>,
          null,
          createElement(Probe),
          createElement(ToastLayer)
        )
      );
    });

    const button = findButton("Download update");

    expect(button).toBeTruthy();

    await act(async () => {
      button?.click();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(findButton("Download update")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Sexy Worktree v1.0.1 available");
  });

  it("dismisses the toast and handles a rejecting async action quietly", async () => {
    vi.resetModules();

    const [{ ToastProvider, useToast }, { ToastLayer }] = await Promise.all([
      import("@renderer/state/toast"),
      import("@renderer/toast/Toast"),
    ]);
    let rejectAction: (reason?: unknown) => void = () => {
      throw new Error("rejectAction not initialized");
    };
    const actionResult = new Promise<void>((_, reject) => {
      rejectAction = reject;
    });
    const catchSpy = vi.spyOn(actionResult, "catch");
    const action = vi.fn(() => actionResult);
    const processUnhandled = vi.fn();
    const windowUnhandled = vi.fn();
    process.on("unhandledRejection", processUnhandled);
    window.addEventListener("unhandledrejection", windowUnhandled);

    function Probe(): React.JSX.Element {
      const { push } = useToast();

      useEffect(() => {
        push({
          kind: "warning",
          title: "Sexy Worktree v1.0.1 available",
          description: "Download the DMG to install it.",
          action: { label: "Download update", onClick: action },
        });
      }, [push]);

      return createElement("div");
    }

    try {
      if (!container) throw new Error("container not initialized");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          createElement(
            ToastProvider as ComponentType<{ children: ReactNode }>,
            null,
            createElement(Probe),
            createElement(ToastLayer)
          )
        );
      });

      const button = findButton("Download update");

      expect(button).toBeTruthy();

      await act(async () => {
        button?.click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(action).toHaveBeenCalledTimes(1);
      expect(findButton("Download update")).toBeUndefined();
      expect(catchSpy).toHaveBeenCalledTimes(1);

      rejectAction(new Error("download failed"));
      await act(async () => {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(processUnhandled).not.toHaveBeenCalled();
      expect(windowUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", processUnhandled);
      window.removeEventListener("unhandledrejection", windowUnhandled);
    }
  });
});
