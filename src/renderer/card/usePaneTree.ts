import { useCallback, useEffect, useRef, useState } from "react";
import type { PaneNode } from "@shared/pane";
import { newLeaf } from "@shared/pane";
import { closeLeaf, splitLeaf, updateLeaf } from "@shared/paneOps";
import { api } from "../ipc/api";

let counter = 0;
const newId = (): string => `p${Date.now()}-${counter++}`;

/**
 * 워크트리별 페인 트리 상태를 관리하는 훅.
 *
 * 마운트 시 DB에서 트리를 로드하고, 변경 시 250ms 디바운스로 저장한다.
 * 분할/닫기/리사이즈/리프 명령 갱신 등의 조작 함수를 함께 반환한다.
 *
 * @param repoId 활성 저장소 식별자
 * @param worktreePath 페인 트리가 속한 워크트리 절대 경로
 */
export function usePaneTree(repoId: number, worktreePath: string) {
  const [tree, setTree] = useState<PaneNode | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마운트 시 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api.pane.load({ repoId, worktreePath });
      if (!alive) return;
      const initial = r.ok && r.value.tree ? r.value.tree : newLeaf(newId());
      setTree(initial);
      setFocusedId((prev) => prev ?? firstLeafId(initial));
    })();
    return () => {
      alive = false;
    };
  }, [repoId, worktreePath]);

  // 디바운스 저장
  useEffect(() => {
    if (!tree) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api.pane.save({ repoId, worktreePath, tree });
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tree, repoId, worktreePath]);

  const split = useCallback(
    (orientation: "horizontal" | "vertical") => {
      setTree((cur) => {
        if (!cur || !focusedId) return cur;
        const newLeafId = newId();
        const next = splitLeaf(cur, focusedId, orientation, newLeafId);
        setFocusedId(newLeafId);
        return next;
      });
    },
    [focusedId]
  );

  const closeFocused = useCallback(() => {
    setTree((cur) => {
      if (!cur || !focusedId) return cur;
      const next = closeLeaf(cur, focusedId);
      if (!next) {
        setFocusedId(null);
        return null;
      }
      setFocusedId(firstLeafId(next));
      return next;
    });
  }, [focusedId]);

  const resize = useCallback((path: number[], sizes: [number, number]) => {
    setTree((cur) => {
      if (!cur) return cur;
      function walk(n: PaneNode, p: number[]): PaneNode {
        if (p.length === 0) {
          if (n.kind !== "split") return n;
          return { ...n, sizes };
        }
        if (n.kind !== "split") return n;
        const head = p[0]!;
        const rest = p.slice(1);
        return head === 0 ? { ...n, a: walk(n.a, rest) } : { ...n, b: walk(n.b, rest) };
      }
      return walk(cur, path);
    });
  }, []);

  const newPane = useCallback(() => {
    const leaf = newLeaf(newId());
    setTree(leaf);
    setFocusedId(leaf.id);
  }, []);

  const updateLeafCommand = useCallback((id: string, cmd: string) => {
    setTree((cur) => (cur ? updateLeaf(cur, id, { lastCommand: cmd }) : cur));
  }, []);

  return { tree, focusedId, setFocusedId, split, closeFocused, resize, newPane, updateLeafCommand };
}

/**
 * 트리에서 가장 먼저 만나는 리프(좌측 우선)의 ID를 반환한다.
 */
function firstLeafId(n: PaneNode): string {
  return n.kind === "leaf" ? n.id : firstLeafId(n.a);
}
