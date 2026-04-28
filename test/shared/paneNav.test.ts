import { describe, it, expect } from "vitest";
import { newLeaf } from "@shared/pane";
import { splitLeaf } from "@shared/paneOps";
import { paneFocusNeighbour } from "@shared/paneNav";

describe("paneFocusNeighbour", () => {
  it("moves right across a vertical split", () => {
    const root = splitLeaf(newLeaf("a"), "a", "vertical", "b");
    expect(paneFocusNeighbour(root, "a", "right")).toBe("b");
  });
  it("moves left across a vertical split", () => {
    const root = splitLeaf(newLeaf("a"), "a", "vertical", "b");
    expect(paneFocusNeighbour(root, "b", "left")).toBe("a");
  });
  it("moves down across a horizontal split", () => {
    const root = splitLeaf(newLeaf("a"), "a", "horizontal", "b");
    expect(paneFocusNeighbour(root, "a", "down")).toBe("b");
  });
  it("returns null when no neighbour in that direction", () => {
    const root = splitLeaf(newLeaf("a"), "a", "vertical", "b");
    expect(paneFocusNeighbour(root, "a", "up")).toBeNull();
  });
});
