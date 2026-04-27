export type PaneLeaf = {
  kind: "leaf";
  id: string;
  lastCommand: string;
};

export type PaneSplit = {
  kind: "split";
  orientation: "horizontal" | "vertical";
  sizes: [number, number];
  a: PaneNode;
  b: PaneNode;
};

export type PaneNode = PaneLeaf | PaneSplit;

export function newLeaf(id: string, lastCommand = ""): PaneLeaf {
  return { kind: "leaf", id, lastCommand };
}
