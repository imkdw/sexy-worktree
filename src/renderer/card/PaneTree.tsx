import { useEffect, useRef, useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { Play, AlertCircle, FolderX } from "lucide-react";
import type { PaneNode } from "@shared/pane";
import type { PtySpawnError } from "@shared/ipc";
import type { LeafEntry } from "../terminal/Terminal";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { cn } from "../lib/cn";

export type LeafExit =
  | { kind: "exited"; code: number; lastBytes: string }
  | { kind: "spawn-failed"; error: PtySpawnError };

type Props = {
  tree: PaneNode;
  focusedId: string | null;
  getEntry: (leafId: string) => LeafEntry | null;
  getExit: (leafId: string) => LeafExit | null;
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
  getEntry,
  getExit,
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
          entry={getEntry(node.id)}
          exit={getExit(node.id)}
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
  exit: LeafExit | null;
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
  exit,
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

  if (exit?.kind === "spawn-failed") {
    return (
      <div className={slotClass} onClick={onFocus}>
        <SpawnFailedView error={exit.error} onRetry={onRestart} />
      </div>
    );
  }

  return (
    <div className={slotClass} onClick={onFocus}>
      {lastCommand && !replayed && !exit && (
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
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <div ref={placeholderRef} className="bg-background h-full w-full flex-1 p-2" />
        {exit?.kind === "exited" && (
          <ExitedBanner
            code={exit.code}
            lastBytes={exit.lastBytes}
            onRestart={(e) => {
              e.stopPropagation();
              onRestart();
            }}
          />
        )}
      </div>
    </div>
  );
}

function SpawnFailedView({
  error,
  onRetry,
}: {
  error: PtySpawnError;
  onRetry: () => void;
}): React.JSX.Element {
  if (error.kind === "cwd-missing") {
    return (
      <div className="text-text-secondary flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <Icon icon={FolderX} size={20} />
        <div className="font-medium">워크트리 디렉터리를 찾을 수 없음</div>
        <code className="text-text-muted bg-surface block max-w-full overflow-hidden rounded-sm px-2 py-1 text-xs text-ellipsis">
          {error.cwd}
        </code>
        <div className="text-text-muted text-xs">
          외부에서 삭제됐거나 옮겨진 워크트리. 디렉터리를 복구하거나 워크트리를 정리하라.
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="bg-accent text-background rounded-sm px-3 py-2 text-sm"
        >
          다시 시도
        </button>
      </div>
    );
  }
  return (
    <div className="text-text-secondary flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <Icon icon={AlertCircle} size={20} />
      <div>PTY를 시작하지 못했음</div>
      <div className="text-text-muted text-xs">{error.message}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        className="bg-accent text-background rounded-sm px-3 py-2 text-sm"
      >
        다시 시도
      </button>
    </div>
  );
}

function ExitedBanner({
  code,
  lastBytes,
  onRestart,
}: {
  code: number;
  lastBytes: string;
  onRestart: (e: React.MouseEvent) => void;
}): React.JSX.Element {
  const tail = lastTextLine(lastBytes);
  return (
    <div className="border-border-subtle bg-surface absolute inset-x-0 bottom-0 flex items-center gap-3 border-t px-3 py-2 text-xs">
      <Icon icon={AlertCircle} size={14} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-text-secondary">PTY exited (code {code})</span>
        {tail && (
          <span className="text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
            {tail}
          </span>
        )}
      </div>
      <button onClick={onRestart} className="bg-accent text-background rounded-sm px-3 py-1">
        Restart
      </button>
    </div>
  );
}

/**
 * ringbuffer에서 ANSI escape 시퀀스와 OSC 토큰을 제거하고 마지막 비공백 라인을 뽑는다.
 * 종료 직전 무엇이 출력됐는지 한 줄로 보여주려는 용도라 완벽하지 않아도 OK.
 */
function lastTextLine(raw: string): string {
  const stripped = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[()][AB012]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  const lines = stripped.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1] ?? "";
  return last.length > 200 ? last.slice(-200) : last;
}
