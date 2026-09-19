import { describe, expect, it, vi } from "vitest";
import { createDialogQueue } from "./dialog-queue";

describe("dialog queue", () => {
  it("shows nothing until something is asked", () => {
    expect(createDialogQueue().current()).toBeNull();
  });

  it("shows the request and resolves its promise with the answer", async () => {
    const queue = createDialogQueue();
    const answer = queue.ask({ kind: "confirm", message: "Sure?" });

    expect(queue.current()).toMatchObject({ kind: "confirm", message: "Sure?" });
    queue.settle(true);

    await expect(answer).resolves.toBe(true);
    expect(queue.current()).toBeNull();
  });

  it("resolves false when it's cancelled", async () => {
    const queue = createDialogQueue();
    const answer = queue.ask({ kind: "confirm", message: "Sure?" });

    queue.settle(false);

    await expect(answer).resolves.toBe(false);
  });

  it("queues a request made while another is open and shows it next, in order", async () => {
    const queue = createDialogQueue();
    const first = queue.ask({ kind: "alert", message: "one" });
    const second = queue.ask({ kind: "confirm", message: "two" });

    expect(queue.current()?.message).toBe("one");
    queue.settle(true);
    expect(queue.current()?.message).toBe("two");
    queue.settle(false);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(queue.current()).toBeNull();
  });

  it("gives every request its own id", () => {
    const queue = createDialogQueue();
    queue.ask({ kind: "alert", message: "one" });
    const firstId = queue.current()?.id;
    queue.settle(true);
    queue.ask({ kind: "alert", message: "one" });

    expect(queue.current()?.id).not.toBe(firstId);
  });

  it("returns the same object until the dialog is answered", () => {
    const queue = createDialogQueue();
    queue.ask({ kind: "alert", message: "hi" });

    expect(queue.current()).toBe(queue.current());
  });

  it("ignores an answer when nothing is open", () => {
    const queue = createDialogQueue();
    expect(() => queue.settle(true)).not.toThrow();
    expect(queue.current()).toBeNull();
  });

  it("does not let a stray second answer skip the next dialog", async () => {
    const queue = createDialogQueue();
    const first = queue.ask({ kind: "confirm", message: "one" });
    queue.settle(true);
    await first;
    const second = queue.ask({ kind: "confirm", message: "two" });

    // "one" is already answered; only the still-open "two" may be settled.
    expect(queue.current()?.message).toBe("two");
    queue.settle(false);
    await expect(second).resolves.toBe(false);
  });

  it("notifies subscribers on every change, and stops after unsubscribing", () => {
    const queue = createDialogQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    queue.ask({ kind: "alert", message: "hi" });
    queue.settle(true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    queue.ask({ kind: "alert", message: "again" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
