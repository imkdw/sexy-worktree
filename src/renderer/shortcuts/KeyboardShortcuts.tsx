import { useEffect } from "react";
import { useMode } from "../state/mode";
import { useRepos } from "../state/repos";
import { useWorktrees, worktreeId } from "../state/worktrees";
import { matchShortcut, type ShortcutAction } from "./shortcutMap";

/**
 * 전역 키보드 단축키 라우팅 컴포넌트.
 *
 * 윈도우 keydown 이벤트를 가로채 단축키 액션으로 매핑한 뒤,
 * 모드 토글·저장소 열기·워크트리 전환 같은 전역 동작은 직접 수행하고
 * 분할/포커스 등 카드 단위 동작은 `app:card-action` 커스텀 이벤트로 위임한다.
 */
export function KeyboardShortcuts(): null {
  const { toggle: toggleMode } = useMode();
  const { openRepo } = useRepos();
  const { worktrees, activeId, setActive } = useWorktrees();

  useEffect(() => {
    function handle(e: KeyboardEvent): void {
      const action = matchShortcut(e);
      if (!action) return;
      if (consumedByTerminal(e)) return;

      e.preventDefault();
      switch (action) {
        case "mode-toggle":
          toggleMode();
          break;
        case "open-repo":
          void openRepo();
          break;
        case "new-worktree":
          window.dispatchEvent(new CustomEvent("app:new-worktree"));
          break;
        case "next-worktree":
        case "prev-worktree": {
          if (worktrees.length === 0) break;
          const idx = Math.max(
            0,
            worktrees.findIndex((w) => worktreeId(w) === activeId)
          );
          const next =
            action === "next-worktree"
              ? (idx + 1) % worktrees.length
              : (idx - 1 + worktrees.length) % worktrees.length;
          const target = worktrees[next];
          if (target) setActive(worktreeId(target));
          break;
        }
        case "split-v":
        case "split-h":
        case "close-pane":
        case "pane-focus-left":
        case "pane-focus-right":
        case "pane-focus-up":
        case "pane-focus-down":
          window.dispatchEvent(
            new CustomEvent<ShortcutAction>("app:card-action", { detail: action })
          );
          break;
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [toggleMode, openRepo, worktrees, activeId, setActive]);

  return null;
}

/**
 * 키 이벤트를 터미널이 우선 소비해야 하는지 판단한다.
 *
 * xterm.js 텍스트 영역이 대부분의 키 입력을 처리하지만, 우리 단축키가 우선해야 한다.
 * ⌘D / ⌘W / ⌘. 등은 네이티브 셸 키스트로크가 아니므로 항상 가로챈다.
 * ⌘C / ⌘V 같은 일반 키는 단축키 맵에 없어 자연스럽게 통과된다.
 */
function consumedByTerminal(e: KeyboardEvent): boolean {
  return false;
  void e; // 사용되지 않는 인자 경고 억제
}
