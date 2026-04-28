import { useEffect, useRef, useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { Play, AlertCircle } from "lucide-react";
import type { PaneNode } from "@shared/pane";
import type { LeafEntry } from "../terminal/Terminal";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { cn } from "../lib/cn";

type Props = {
  tree: PaneNode;
  focusedId: string | null;
  entries: Map<string, LeafEntry>;
  exitCodes: Map<string, number>;
  onFocusLeaf: (id: string) => void;
  onResize: (path: number[], sizes: [number, number]) => void;
  onRestart: (id: string) => void;
};

/**
 * 페인 트리(분할 구조)를 재귀적으로 렌더링한다.
 *
 * 리프 노드는 카드 레벨에서 관리되는 xterm 인스턴스를 attach할 placeholder만
 * 그리고, 분할 노드는 Allotment 분할 영역으로 그린다.
 */
export function PaneTree({
  tree,
  focusedId,
  entries,
  exitCodes,
  onFocusLeaf,
  onResize,
  onRestart,
}: Props): React.JSX.Element {
  function renderNode(node: PaneNode, path: number[]): React.JSX.Element {
    if (node.kind === "leaf") {
      return (
        <LeafSlot
          key={node.id}
          focused={node.id === focusedId}
          lastCommand={node.lastCommand}
          entry={entries.get(node.id) ?? null}
          exitCode={exitCodes.get(node.id) ?? null}
          onFocus={() => onFocusLeaf(node.id)}
          onRestart={() => onRestart(node.id)}
        />
      );
    }
    const vertical = node.orientation === "horizontal";
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

type LeafSlotProps = {
  focused: boolean;
  lastCommand: string;
  entry: LeafEntry | null;
  exitCode: number | null;
  onFocus: () => void;
  onRestart: () => void;
};

/**
 * 단일 leaf 슬롯. 카드 레벨 인스턴스 풀에서 받은 entry의 xterm DOM을 자기
 * placeholder로 옮겨 attach한다. 분할 등으로 LeafSlot이 unmount/remount되어도
 * entry(term + PTY)는 풀에 살아있으므로 출력·진행 중인 명령이 보존된다.
 */
function LeafSlot({
  focused,
  lastCommand,
  entry,
  exitCode,
  onFocus,
  onRestart,
}: LeafSlotProps): React.JSX.Element {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [replayed, setReplayed] = useState(false);

  useEffect(() => {
    setReplayed(false);
  }, [lastCommand]);

  useEffect(() => {
    if (!entry || !placeholderRef.current) return;
    const placeholder = placeholderRef.current;

    if (!entry.term.element) {
      entry.term.open(placeholder);
    } else if (entry.term.element.parentElement !== placeholder) {
      placeholder.appendChild(entry.term.element);
    }
    try {
      entry.fit.fit();
    } catch {
      // fit은 placeholder 크기가 0일 때 throw 가능 — 다음 ResizeObserver tick에서 다시 호출됨
    }

    const ro = new ResizeObserver(() => {
      try {
        entry.fit.fit();
      } catch {
        // 무시 (위와 동일 사유)
      }
    });
    ro.observe(placeholder);

    return () => {
      ro.disconnect();
    };
  }, [entry]);

  const slotClass = cn(
    "flex min-h-0 min-w-0 flex-1 flex-col",
    focused && "outline-accent-soft outline outline-1 -outline-offset-1"
  );

  if (exitCode !== null) {
    return (
      <div className={slotClass} onClick={onFocus}>
        <div className="text-text-secondary flex flex-1 flex-col items-center justify-center gap-3">
          <Icon icon={AlertCircle} size={20} />
          <div>PTY exited (code {exitCode})</div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestart();
            }}
            className="bg-accent text-background rounded-sm px-3 py-2 text-sm"
          >
            Restart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={slotClass} onClick={onFocus}>
      {lastCommand && !replayed && (
        <div className="text-text-muted flex items-center gap-2 p-2 text-xs">
          <span>
            Last: <code className="text-text-secondary">{lastCommand}</code>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (entry?.ptyId) void api.pty.write({ id: entry.ptyId, data: lastCommand + "\n" });
              setReplayed(true);
            }}
            className="text-accent inline-flex items-center gap-1"
          >
            <Icon icon={Play} size={12} /> Replay
          </button>
        </div>
      )}
      <div ref={placeholderRef} className="bg-background h-full w-full flex-1 p-2" />
    </div>
  );
}
