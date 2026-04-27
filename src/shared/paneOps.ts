import { newLeaf, type PaneNode, type PaneLeaf, type PaneSplit } from "./pane";

export function splitLeaf(
  root: PaneNode,
  targetId: string,
  orientation: "horizontal" | "vertical",
  newId: string
): PaneNode {
  function walk(node: PaneNode): PaneNode {
    if (node.kind === "leaf") {
      if (node.id !== targetId) return node;
      return {
        kind: "split",
        orientation,
        sizes: [50, 50],
        a: node,
        b: newLeaf(newId),
      } satisfies PaneSplit;
    }
    return { ...node, a: walk(node.a), b: walk(node.b) };
  }
  return walk(root);
}

export function closeLeaf(root: PaneNode, targetId: string): PaneNode | null {
  function walk(node: PaneNode): PaneNode | null {
    if (node.kind === "leaf") {
      return node.id === targetId ? null : node;
    }
    const a = walk(node.a);
    const b = walk(node.b);
    if (a === null && b === null) return null;
    if (a === null) return b!;
    if (b === null) return a;
    return { ...node, a, b };
  }
  return walk(root);
}

export function findLeafIds(root: PaneNode): string[] {
  const out: string[] = [];
  function walk(n: PaneNode): void {
    if (n.kind === "leaf") out.push(n.id);
    else {
      walk(n.a);
      walk(n.b);
    }
  }
  walk(root);
  return out;
}

export function findLeaf(root: PaneNode, id: string): PaneLeaf | null {
  function walk(n: PaneNode): PaneLeaf | null {
    if (n.kind === "leaf") return n.id === id ? n : null;
    return walk(n.a) ?? walk(n.b);
  }
  return walk(root);
}

export function updateLeaf(root: PaneNode, id: string, patch: Partial<PaneLeaf>): PaneNode {
  function walk(n: PaneNode): PaneNode {
    if (n.kind === "leaf") return n.id === id ? { ...n, ...patch } : n;
    return { ...n, a: walk(n.a), b: walk(n.b) };
  }
  return walk(root);
}
