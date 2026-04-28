import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { PtySpawnError } from "@shared/ipc";
import { api } from "../ipc/api";
import { cssVar } from "../lib/cssVar";

export type LeafEntry = {
  term: XTerm;
  fit: FitAddon;
  ptyId: string | null;
  inputBuf: string;
  unsubData: (() => void) | null;
  unsubExit: (() => void) | null;
  onCommandRun: ((cmd: string) => void) | null;
  onExit: ((code: number, lastBytes: string) => void) | null;
  onSpawnError: ((err: PtySpawnError) => void) | null;
};

export type SpawnResult = { ok: true; id: string } | { ok: false; error: PtySpawnError };

/**
 * leaf 단위 xterm + FitAddon 인스턴스를 만든다.
 *
 * PTY 라이프사이클은 별도 (spawnPtyForEntry / disposePtyForEntry).
 * 한 번 만들어진 인스턴스는 React 컴포넌트 mount/unmount와 무관하게
 * 카드 레벨에서 보관하여 분할 시에도 출력 버퍼가 보존되도록 한다.
 */
export function createLeafEntry(): LeafEntry {
  const term = new XTerm({
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.3,
    cursorBlink: true,
    theme: {
      background: cssVar("--color-background"),
      foreground: cssVar("--color-text-primary"),
      cursor: cssVar("--color-accent"),
      selectionBackground: cssVar("--color-accent-soft"),
    },
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const entry: LeafEntry = {
    term,
    fit,
    ptyId: null,
    inputBuf: "",
    unsubData: null,
    unsubExit: null,
    onCommandRun: null,
    onExit: null,
    onSpawnError: null,
  };

  term.onData((data) => {
    if (entry.ptyId) void api.pty.write({ id: entry.ptyId, data });
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const cmd = entry.inputBuf.trim();
        if (cmd) entry.onCommandRun?.(cmd);
        entry.inputBuf = "";
      } else if (ch === "\x7f" || ch === "\b") {
        entry.inputBuf = entry.inputBuf.slice(0, -1);
      } else if (ch >= " ") {
        entry.inputBuf += ch;
      }
    }
  });

  term.onResize(({ cols, rows }) => {
    if (entry.ptyId) void api.pty.resize({ id: entry.ptyId, cols, rows });
  });

  return entry;
}

/**
 * entry에 새 PTY를 spawn하고 데이터/종료 리스너를 부착한다.
 * 이미 ptyId가 있으면 먼저 disposePtyForEntry로 정리한 뒤 호출해야 한다.
 *
 * spawn 자체가 실패하면(예: cwd 누락) onSpawnError 콜백이 호출되고
 * `{ ok: false }`가 반환된다. 셸이 spawn 후에 죽는 경우는 onExit 경로로 흐른다.
 */
export async function spawnPtyForEntry(entry: LeafEntry, cwd: string): Promise<SpawnResult> {
  const r = await api.pty.spawn({
    cwd,
    cols: entry.term.cols,
    rows: entry.term.rows,
  });
  if (!r.ok) {
    entry.onSpawnError?.(r.error);
    return { ok: false, error: r.error };
  }
  const { id } = r.value;
  entry.ptyId = id;

  entry.unsubData = api.pty.onData((evt) => {
    if (evt.id === id) entry.term.write(evt.data);
  });
  entry.unsubExit = api.pty.onExit((evt) => {
    if (evt.id === id) {
      entry.term.write(`\r\n[process exited with code ${evt.exitCode}]\r\n`);
      entry.onExit?.(evt.exitCode, evt.lastBytes);
    }
  });

  return { ok: true, id };
}

/**
 * entry의 PTY와 IPC 리스너만 정리한다 (xterm 인스턴스는 유지).
 * Restart 흐름에서 같은 term을 재사용해 새 PTY를 붙일 때 사용.
 */
export function disposePtyForEntry(entry: LeafEntry): void {
  entry.unsubData?.();
  entry.unsubExit?.();
  entry.unsubData = null;
  entry.unsubExit = null;
  if (entry.ptyId) void api.pty.kill({ id: entry.ptyId });
  entry.ptyId = null;
}

/**
 * entry 전체 정리 — PTY kill + xterm dispose. leaf가 트리에서 영구 제거될 때 사용.
 */
export function disposeLeafEntry(entry: LeafEntry): void {
  disposePtyForEntry(entry);
  entry.term.dispose();
}
