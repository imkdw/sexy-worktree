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
