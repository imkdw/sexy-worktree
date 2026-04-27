export type ShortcutAction =
  | "mode-toggle"
  | "new-worktree"
  | "open-repo"
  | "split-v"
  | "split-h"
  | "close-pane"
  | "next-worktree"
  | "prev-worktree"
  | "pane-focus-left"
  | "pane-focus-right"
  | "pane-focus-up"
  | "pane-focus-down";

type KeyInfo = Pick<KeyboardEvent, "key" | "metaKey" | "shiftKey" | "altKey">;

export function matchShortcut(e: KeyInfo): ShortcutAction | null {
  if (!e.metaKey) return null;
  const k = e.key.toLowerCase();
  if (k === ".") return "mode-toggle";
  if (k === "n" && !e.shiftKey) return "new-worktree";
  if (k === "o" && !e.shiftKey) return "open-repo";
  if (k === "w" && !e.shiftKey) return "close-pane";
  if (k === "d" && !e.shiftKey) return "split-v";
  if (k === "d" && e.shiftKey) return "split-h";
  if (k === "]" && e.shiftKey) return "next-worktree";
  if (k === "[" && e.shiftKey) return "prev-worktree";
  if (e.altKey) {
    if (k === "arrowleft") return "pane-focus-left";
    if (k === "arrowright") return "pane-focus-right";
    if (k === "arrowup") return "pane-focus-up";
    if (k === "arrowdown") return "pane-focus-down";
  }
  return null;
}
