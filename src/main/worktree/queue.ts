type Task = () => Promise<void>;

export class SerialQueue {
  private q: Task[] = [];
  private running = false;
  private idleResolvers: Array<() => void> = [];

  enqueue(task: Task): void {
    this.q.push(task);
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.q.length > 0) {
      const t = this.q.shift()!;
      try {
        await t();
      } catch (e) {
        console.error("serial-queue task failed:", e);
      }
    }
    this.running = false;
    for (const r of this.idleResolvers.splice(0)) r();
  }

  idle(): Promise<void> {
    if (!this.running && this.q.length === 0) return Promise.resolve();
    return new Promise((r) => this.idleResolvers.push(r));
  }
}
