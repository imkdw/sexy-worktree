import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { Terminal } from "../terminal/Terminal";
import type { PaneNode } from "@shared/pane";
import { cn } from "../lib/cn";

type Props = {
  cwd: string;
  tree: PaneNode;
  focusedId: string | null;
  onFocusLeaf: (id: string) => void;
  onResize: (path: number[], sizes: [number, number]) => void;
  onUpdateLeafCommand: (id: string, cmd: string) => void;
  onPtyId?: (id: string) => void;
};

/**
 * 페인 트리(분할 구조)를 재귀적으로 렌더링한다.
 *
 * 리프 노드는 터미널을, 분할 노드는 Allotment 분할 영역으로 그린다.
 * 포커스된 리프에는 강조 외곽선이 표시된다.
 */
export function PaneTree({
  cwd,
  tree,
  focusedId,
  onFocusLeaf,
  onResize,
  onUpdateLeafCommand,
  onPtyId,
}: Props): React.JSX.Element {
  function renderNode(node: PaneNode, path: number[]): React.JSX.Element {
    if (node.kind === "leaf") {
      const focused = node.id === focusedId;
      return (
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1",
            focused && "outline-accent-soft outline outline-1 -outline-offset-1"
          )}
          onClick={() => onFocusLeaf(node.id)}
        >
          <Terminal
            cwd={cwd}
            lastCommand={node.lastCommand}
            onCommandRun={(cmd) => onUpdateLeafCommand(node.id, cmd)}
            {...(onPtyId ? { onPtyId } : {})}
          />
        </div>
      );
    }
    const vertical = node.orientation === "horizontal"; // Allotment의 "vertical" 프롭은 세로로 쌓는 것을 의미함
    return (
      <Allotment
        vertical={vertical}
        defaultSizes={node.sizes}
        onChange={(sizes) => onResize(path, [sizes[0]!, sizes[1]!] as [number, number])}
      >
        <Allotment.Pane minSize={120}>{renderNode(node.a, [...path, 0])}</Allotment.Pane>
        <Allotment.Pane minSize={120}>{renderNode(node.b, [...path, 1])}</Allotment.Pane>
      </Allotment>
    );
  }
  return renderNode(tree, []);
}
