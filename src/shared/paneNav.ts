import type { PaneNode, PaneSplit } from "./pane";

type Dir = "left" | "right" | "up" | "down";
type Frontier = "leftmost" | "rightmost" | "topmost" | "bottommost";

/**
 * 페인 트리에서 주어진 리프의 방향 이동 대상 리프 ID를 찾는다.
 *
 * 루트에서 포커스된 리프까지의 경로를 만든 뒤, 리프에서 루트 방향으로 거슬러
 * 올라가며 이동 방향과 일치하는 분할을 만나면 반대편 자식의 경계 리프로 이동한다.
 *
 * @param root 페인 트리의 루트
 * @param fromId 현재 포커스된 리프 ID
 * @param dir 이동 방향 (left/right/up/down)
 * @returns 이동 대상 리프 ID, 더 이상 이동할 곳이 없으면 null
 */
export function paneFocusNeighbour(root: PaneNode, fromId: string, dir: Dir): string | null {
  const want = dir === "left" || dir === "right" ? "vertical" : "horizontal";
  const wantSide = dir === "right" || dir === "down" ? "b" : "a";

  // 루트에서 시작해 포커스된 리프까지의 (split, side) 경로를 구성한다
  const path: Array<{ split: PaneSplit; side: "a" | "b" }> = [];
  function find(n: PaneNode): boolean {
    if (n.kind === "leaf") return n.id === fromId;
    if (find(n.a)) {
      path.unshift({ split: n, side: "a" });
      return true;
    }
    if (find(n.b)) {
      path.unshift({ split: n, side: "b" });
      return true;
    }
    return false;
  }
  if (!find(root)) return null;

  // 리프에서 루트로 올라가며 이동하려는 방향과 반대 쪽에 포커스가 있는
  // 가장 가까운 일치 방향의 분할을 찾는다
  for (let i = path.length - 1; i >= 0; i--) {
    const { split, side } = path[i]!;
    if (split.orientation !== want) continue;
    if (wantSide === "a" && side === "b") return frontierLeaf(split.a, oppositeFrontier(dir));
    if (wantSide === "b" && side === "a") return frontierLeaf(split.b, oppositeFrontier(dir));
  }
  return null;
}

/**
 * 이동 방향에 대응되는 반대편 경계 위치를 반환한다.
 * 예: 오른쪽으로 이동 → 도착 영역의 가장 왼쪽 경계 리프를 선택해야 한다.
 */
function oppositeFrontier(dir: Dir): Frontier {
  if (dir === "right") return "leftmost";
  if (dir === "left") return "rightmost";
  if (dir === "down") return "topmost";
  return "bottommost";
}

/**
 * 서브트리에서 지정한 경계(가장 왼쪽/오른쪽/위/아래)에 위치한 리프 ID를 반환한다.
 */
function frontierLeaf(n: PaneNode, frontier: Frontier): string {
  if (n.kind === "leaf") return n.id;
  const want = frontier === "leftmost" || frontier === "rightmost" ? "vertical" : "horizontal";
  const child =
    n.orientation === want ? (frontier === "leftmost" || frontier === "topmost" ? n.a : n.b) : n.a;
  return frontierLeaf(child, frontier);
}
