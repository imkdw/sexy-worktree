import { describe, it, expect } from "vitest";
import { SerialQueue } from "./queue";

describe("SerialQueue", () => {
  it("runs jobs strictly serially in enqueue order", async () => {
    const q = new SerialQueue();
    const order: number[] = [];
    const job = (n: number, delay: number) => () =>
      new Promise<void>((res) =>
        setTimeout(() => {
          order.push(n);
          res();
        }, delay)
      );
    q.enqueue(job(1, 30));
    q.enqueue(job(2, 10));
    q.enqueue(job(3, 0));
    await q.idle();
    expect(order).toEqual([1, 2, 3]);
  });

  it("continues running queued jobs after one fails", async () => {
    const q = new SerialQueue();
    const out: string[] = [];
    q.enqueue(async () => {
      throw new Error("boom");
    });
    q.enqueue(async () => {
      out.push("after");
    });
    await q.idle();
    expect(out).toEqual(["after"]);
  });
});
