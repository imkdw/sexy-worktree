// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@shared/result";

type KeyHandler = (event: KeyboardEvent) => boolean;

class FakeXTerm {
  readonly cols = 80;
  readonly rows = 24;
  readonly element = document.createElement("div");
  readonly input = vi.fn();
  readonly write = vi.fn();
  readonly dispose = vi.fn();
  readonly loadAddon = vi.fn();
  readonly registerLinkProvider = vi.fn();
  readonly onData = vi.fn();
  readonly onResize = vi.fn();
  readonly attachCustomKeyEventHandler = vi.fn((handler: KeyHandler) => {
    this.keyHandler = handler;
  });

  keyHandler: KeyHandler | null = null;

  constructor() {
    terminalInstances.push(this);
  }
}

class FakeFitAddon {
  readonly fit = vi.fn();
}

const terminalInstances: FakeXTerm[] = [];
const ptyWriteMock = vi.fn();

function setApiMock(): void {
  window.api = {
    pty: {
      spawn: vi.fn().mockResolvedValue(ok({ id: "pty-1" })),
      write: ptyWriteMock,
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
  } as unknown as typeof window.api;
}

function latestTerminal(): FakeXTerm {
  const term = terminalInstances.at(-1);
  if (!term) throw new Error("expected a terminal instance");
  return term;
}

describe("Terminal", () => {
  beforeEach(() => {
    vi.resetModules();
    terminalInstances.length = 0;
    ptyWriteMock.mockReset();
    document.documentElement.style.setProperty("--color-terminal-bg", "#000000");
    document.documentElement.style.setProperty("--color-text-primary", "#ffffff");
    document.documentElement.style.setProperty("--color-accent", "#ffffff");
    document.documentElement.style.setProperty("--color-accent-soft", "#ffffff");
    setApiMock();

    vi.doMock("@xterm/xterm", () => ({
      Terminal: FakeXTerm,
    }));
    vi.doMock("@xterm/addon-fit", () => ({
      FitAddon: FakeFitAddon,
    }));
  });

  it("writes Claude Code newline sequence directly to an attached PTY on Shift+Enter", async () => {
    const { createLeafEntry } = await import("@renderer/terminal/Terminal");

    const entry = createLeafEntry({ worktreePath: "/repo" });
    entry.ptyId = "pty-1";
    const term = latestTerminal();

    const consumed = term.keyHandler?.(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
      })
    );

    expect(consumed).toBe(false);
    expect(ptyWriteMock).toHaveBeenCalledWith({ id: "pty-1", data: "\x1b\r" });
    expect(term.input).not.toHaveBeenCalled();
  });

  it("handles alternate Enter keyboard event shapes", async () => {
    const { createLeafEntry } = await import("@renderer/terminal/Terminal");

    const entry = createLeafEntry({ worktreePath: "/repo" });
    entry.ptyId = "pty-1";
    const term = latestTerminal();

    const consumed = term.keyHandler?.(
      new KeyboardEvent("keydown", {
        key: "NumpadEnter",
        code: "NumpadEnter",
        shiftKey: true,
      })
    );

    expect(consumed).toBe(false);
    expect(ptyWriteMock).toHaveBeenCalledWith({ id: "pty-1", data: "\x1b\r" });
  });

  it("falls back to xterm input before a PTY is attached", async () => {
    const { createLeafEntry } = await import("@renderer/terminal/Terminal");

    createLeafEntry({ worktreePath: "/repo" });
    const term = latestTerminal();

    const consumed = term.keyHandler?.(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
      })
    );

    expect(consumed).toBe(false);
    expect(term.input).toHaveBeenCalledWith("\x1b\r");
    expect(ptyWriteMock).not.toHaveBeenCalled();
  });

  it("installs a DOM capture handler for Shift+Enter after xterm is opened", async () => {
    const { createLeafEntry, installLeafEntryKeyHandler } = await import(
      "@renderer/terminal/Terminal"
    );

    const entry = createLeafEntry({ worktreePath: "/repo" });
    entry.ptyId = "pty-1";
    const term = latestTerminal();
    const ev = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    installLeafEntryKeyHandler(entry);
    term.element.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(ptyWriteMock).toHaveBeenCalledWith({ id: "pty-1", data: "\x1b\r" });
  });
});
