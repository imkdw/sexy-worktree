import { describe, it, expect } from "vitest";
import { matchShortcut, type ShortcutAction } from "@renderer/shortcuts/shortcutMap";

function ev(init: {
  key?: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): Pick<KeyboardEvent, "key" | "metaKey" | "shiftKey" | "altKey"> {
  return {
    key: init.key ?? "",
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  };
}

describe("matchShortcut", () => {
  it("⌘. → mode-toggle", () => {
    expect(matchShortcut(ev({ key: ".", metaKey: true }))).toBe<ShortcutAction>("mode-toggle");
  });
  it("⌘N → new-worktree", () => {
    expect(matchShortcut(ev({ key: "n", metaKey: true }))).toBe<ShortcutAction>("new-worktree");
  });
  it("⌘O → open-repo", () => {
    expect(matchShortcut(ev({ key: "o", metaKey: true }))).toBe<ShortcutAction>("open-repo");
  });
  it("⌘D → split-v", () => {
    expect(matchShortcut(ev({ key: "d", metaKey: true }))).toBe<ShortcutAction>("split-v");
  });
  it("⌘⇧D → split-h", () => {
    expect(matchShortcut(ev({ key: "d", metaKey: true, shiftKey: true }))).toBe<ShortcutAction>(
      "split-h"
    );
  });
  it("⌘W → close-pane", () => {
    expect(matchShortcut(ev({ key: "w", metaKey: true }))).toBe<ShortcutAction>("close-pane");
  });
  it("⌘⇧] → next-worktree", () => {
    expect(matchShortcut(ev({ key: "]", metaKey: true, shiftKey: true }))).toBe<ShortcutAction>(
      "next-worktree"
    );
  });
  it("⌘⇧[ → prev-worktree", () => {
    expect(matchShortcut(ev({ key: "[", metaKey: true, shiftKey: true }))).toBe<ShortcutAction>(
      "prev-worktree"
    );
  });
  it("plain key → null", () => {
    expect(matchShortcut(ev({ key: "d" }))).toBe(null);
  });
});

describe("matchShortcut — open-settings (⌘,)", () => {
  it("⌘, → open-settings 로 매핑된다", () => {
    expect(matchShortcut(ev({ key: ",", metaKey: true }))).toBe<ShortcutAction>("open-settings");
  });

  it("⌘⇧, → open-settings 로 매핑된다 (shift 가드 없음, 표준 macOS 일관)", () => {
    expect(matchShortcut(ev({ key: ",", metaKey: true, shiftKey: true }))).toBe<ShortcutAction>(
      "open-settings"
    );
  });

  it("metaKey 없이 , 만 누르면 매핑되지 않는다", () => {
    expect(matchShortcut(ev({ key: "," }))).toBe(null);
  });

  it("회귀 — ⌘. 는 여전히 mode-toggle 로 매핑된다", () => {
    expect(matchShortcut(ev({ key: ".", metaKey: true }))).toBe<ShortcutAction>("mode-toggle");
  });

  it("회귀 — ⌘N 은 여전히 new-worktree 로 매핑된다", () => {
    expect(matchShortcut(ev({ key: "n", metaKey: true }))).toBe<ShortcutAction>("new-worktree");
  });
});
