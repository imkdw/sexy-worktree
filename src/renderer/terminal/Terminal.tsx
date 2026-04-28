import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Play, AlertCircle } from "lucide-react";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { cssVar } from "../lib/cssVar";

type TerminalProps = {
  cwd: string;
  onPtyId?: (id: string) => void;
  onExit?: (code: number) => void;
  lastCommand?: string;
  onLastCommandUsed?: () => void;
  onCommandRun?: (cmd: string) => void;
};

/**
 * xterm.js 기반 터미널 뷰.
 *
 * 메인 프로세스에 PTY 생성을 요청한 뒤, 데이터/종료 이벤트를 구독하고
 * 사용자 입력을 PTY로 전달한다. 종료 시에는 재시작 UI를 노출한다.
 */
export function Terminal({
  cwd,
  onPtyId,
  onExit,
  lastCommand,
  onLastCommandUsed,
  onCommandRun,
}: TerminalProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const ptyIdRef = useRef<string | null>(null);
  const [replayed, setReplayed] = useState(false);
  const [crashed, setCrashed] = useState<number | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  // cwd가 바뀌면 새 세션이 깨끗하게 시작되도록 크래시 상태 초기화
  useEffect(() => {
    setCrashed(null);
  }, [cwd]);

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

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
    term.open(hostRef.current);
    fit.fit();

    (async () => {
      const r = await api.pty.spawn({
        cwd,
        cols: term.cols,
        rows: term.rows,
      });
      if (!r.ok || disposed) return;
      const { id } = r.value;
      ptyIdRef.current = id;
      onPtyId?.(id);

      unsubData = api.pty.onData((evt) => {
        if (evt.id === id) term.write(evt.data);
      });
      unsubExit = api.pty.onExit((evt) => {
        if (evt.id === id) {
          term.write(`\r\n[process exited with code ${evt.exitCode}]\r\n`);
          setCrashed(evt.exitCode);
          onExit?.(evt.exitCode);
        }
      });

      let inputBuf = "";
      term.onData((data) => {
        void api.pty.write({ id, data });
        // 명령 추적을 위한 입력 버퍼 캡처
        for (const ch of data) {
          if (ch === "\r" || ch === "\n") {
            const cmd = inputBuf.trim();
            if (cmd && onCommandRun) onCommandRun(cmd);
            inputBuf = "";
          } else if (ch === "\x7f" || ch === "\b") {
            inputBuf = inputBuf.slice(0, -1);
          } else if (ch >= " ") {
            inputBuf += ch;
          }
        }
      });
      term.onResize(({ cols, rows }) => {
        void api.pty.resize({ id, cols, rows });
      });
    })();

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(hostRef.current);

    return () => {
      disposed = true;
      ro.disconnect();
      unsubData?.();
      unsubExit?.();
      const id = ptyIdRef.current;
      if (id) void api.pty.kill({ id });
      term.dispose();
    };
  }, [cwd, restartKey]);

  if (crashed !== null) {
    return (
      <div className="text-text-secondary flex flex-1 flex-col items-center justify-center gap-3">
        <Icon icon={AlertCircle} size={20} />
        <div>PTY exited (code {crashed})</div>
        <button
          onClick={() => {
            setCrashed(null);
            setRestartKey((k) => k + 1);
          }}
          className="bg-accent text-background rounded-sm px-3 py-2 text-sm"
        >
          Restart
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {lastCommand && !replayed && (
        <div className="text-text-muted flex items-center gap-2 p-2 text-xs">
          <span>
            Last: <code className="text-text-secondary">{lastCommand}</code>
          </span>
          <button
            onClick={() => {
              const id = ptyIdRef.current;
              if (id) void api.pty.write({ id, data: lastCommand + "\n" });
              setReplayed(true);
              onLastCommandUsed?.();
            }}
            className="text-accent inline-flex items-center gap-1"
          >
            <Icon icon={Play} size={12} /> Replay
          </button>
        </div>
      )}
      <div ref={hostRef} className="bg-background h-full w-full flex-1 p-2" />
    </div>
  );
}
