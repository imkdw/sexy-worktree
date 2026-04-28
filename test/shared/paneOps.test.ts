import { describe, it, expect } from "vitest";
import { newLeaf } from "@shared/pane";
import { splitLeaf, closeLeaf, findLeafIds } from "@shared/paneOps";

describe("paneOps", () => {
  it("split replaces the focused leaf with a split node", () => {
    const root = newLeaf("a");
    const next = splitLeaf(root, "a", "vertical", "b");
    expect(next.kind).toBe("split");
    if (next.kind === "split") {
      expect(next.a.kind).toBe("leaf");
      expect(next.b.kind).toBe("leaf");
      if (next.a.kind === "leaf") expect(next.a.id).toBe("a");
      if (next.b.kind === "leaf") expect(next.b.id).toBe("b");
    }
  });

  it("close collapses a split when the sibling becomes the only leaf", () => {
    const root = splitLeaf(newLeaf("a"), "a", "vertical", "b");
    const next = closeLeaf(root, "a");
    expect(next).not.toBeNull();
    if (next) {
      expect(next.kind).toBe("leaf");
      if (next.kind === "leaf") expect(next.id).toBe("b");
    }
  });

  it("close returns null when the last leaf is closed", () => {
    const root = newLeaf("a");
    expect(closeLeaf(root, "a")).toBeNull();
  });

  it("findLeafIds returns ids in deterministic dfs order", () => {
    const root = splitLeaf(newLeaf("a"), "a", "vertical", "b");
    expect(findLeafIds(root)).toEqual(["a", "b"]);
  });
});
