import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import type { PtyId, PtySpawnArgs } from "@shared/ipc";

type Entry = {
  proc: pty.IPty;
  dataListeners: Set<(d: string) => void>;
  exitListeners: Set<(code: number, signal: number | null) => void>;
};

export class PtyManager {
  private map = new Map<PtyId, Entry>();

  spawn(args: PtySpawnArgs): PtyId {
    const id = randomUUID();
    const shell = args.shell ?? process.env.SHELL ?? "/bin/zsh";
    const proc = pty.spawn(shell, ["-l"], {
      cwd: args.cwd,
      cols: args.cols,
      rows: args.rows,
      env: { ...process.env, ...args.env, TERM: "xterm-256color" } as { [k: string]: string },
    });
    const entry: Entry = { proc, dataListeners: new Set(), exitListeners: new Set() };
    proc.onData((d) => {
      for (const fn of entry.dataListeners) fn(d);
    });
    proc.onExit(({ exitCode, signal }) => {
      for (const fn of entry.exitListeners) fn(exitCode, signal ?? null);
      this.map.delete(id);
    });
    this.map.set(id, entry);
    return id;
  }

  write(id: PtyId, data: string): void {
    this.map.get(id)?.proc.write(data);
  }

  resize(id: PtyId, cols: number, rows: number): void {
    this.map.get(id)?.proc.resize(cols, rows);
  }

  kill(id: PtyId): void {
    this.map.get(id)?.proc.kill();
    this.map.delete(id);
  }

  killAll(): void {
    for (const id of [...this.map.keys()]) this.kill(id);
  }

  has(id: PtyId): boolean {
    return this.map.has(id);
  }

  onData(id: PtyId, fn: (d: string) => void): () => void {
    const e = this.map.get(id);
    if (!e) return () => {};
    e.dataListeners.add(fn);
    return () => e.dataListeners.delete(fn);
  }

  onExit(id: PtyId, fn: (exitCode: number, signal: number | null) => void): () => void {
    const e = this.map.get(id);
    if (!e) return () => {};
    e.exitListeners.add(fn);
    return () => e.exitListeners.delete(fn);
  }
}
