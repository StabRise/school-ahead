import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import messages from "../../messages/uk.json";
import { DialogProvider, useDialogs, type Dialogs } from "./app-dialogs";

// React only flushes updates inside act() when it knows it's in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let dialogs: Dialogs;

// Hands the hook's value out to the tests below.
function Capture({ onDialogs }: { onDialogs: (dialogs: Dialogs) => void }) {
  const current = useDialogs();
  useEffect(() => onDialogs(current), [current, onDialogs]);
  return null;
}

const captureDialogs = (value: Dialogs) => {
  dialogs = value;
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <NextIntlClientProvider locale="uk" messages={messages}>
        <DialogProvider>
          <Capture onDialogs={captureDialogs} />
        </DialogProvider>
      </NextIntlClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const dialogEl = () => document.querySelector<HTMLElement>('[role="dialog"]');
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
const buttonLabelled = (label: string) => buttons().find((b) => b.textContent === label);

// Runs the callback and lets the promise/state updates it causes settle.
async function flush<T>(fn: () => T | Promise<T>): Promise<T> {
  let result!: T;
  await act(async () => {
    result = await fn();
  });
  return result;
}

describe("app dialogs", () => {
  it("shows nothing until asked", () => {
    expect(dialogEl()).toBeNull();
  });

  it("confirm: shows the message, resolves true on the confirm button", async () => {
    let answer!: Promise<boolean>;
    await flush(() => {
      answer = dialogs.confirm("Видалити урок?");
    });

    expect(dialogEl()?.textContent).toContain("Видалити урок?");
    expect(dialogEl()?.textContent).toContain(messages.Dialog.confirmTitle);

    await flush(() => buttonLabelled(messages.Dialog.confirmButton)!.click());

    await expect(answer).resolves.toBe(true);
    expect(dialogEl()).toBeNull();
  });

  it("confirm: resolves false on Cancel", async () => {
    let answer!: Promise<boolean>;
    await flush(() => {
      answer = dialogs.confirm("Sure?");
    });

    await flush(() => buttonLabelled(messages.Dialog.cancelButton)!.click());

    await expect(answer).resolves.toBe(false);
    expect(dialogEl()).toBeNull();
  });

  it("confirm: Escape counts as no", async () => {
    let answer!: Promise<boolean>;
    await flush(() => {
      answer = dialogs.confirm("Sure?");
    });

    await flush(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await expect(answer).resolves.toBe(false);
    expect(dialogEl()).toBeNull();
  });

  it("confirm: focuses Cancel, so a stray Enter can't confirm a deletion", async () => {
    await flush(() => {
      void dialogs.confirm({ message: "Delete?", tone: "danger" });
    });

    expect(document.activeElement).toBe(buttonLabelled(messages.Dialog.cancelButton));
  });

  it("confirm: a danger tone makes the confirm button red", async () => {
    await flush(() => {
      void dialogs.confirm({ message: "Delete?", tone: "danger" });
    });

    expect(buttonLabelled(messages.Dialog.confirmButton)!.className).toContain("bg-red-600");
  });

  it("alert: one OK button, no cancel", async () => {
    let done!: Promise<void>;
    await flush(() => {
      done = dialogs.alert("Готово");
    });

    expect(buttons().map((b) => b.textContent)).toEqual([messages.Dialog.okButton]);
    expect(dialogEl()?.textContent).toContain(messages.Dialog.alertTitle);

    await flush(() => buttonLabelled(messages.Dialog.okButton)!.click());
    await expect(done).resolves.toBeUndefined();
    expect(dialogEl()).toBeNull();
  });

  it("error: titled as an error", async () => {
    await flush(() => {
      void dialogs.error("Не вдалося");
    });

    expect(dialogEl()?.textContent).toContain(messages.Dialog.errorTitle);
    expect(dialogEl()?.textContent).toContain("Не вдалося");
  });

  it("accepts custom title and button labels", async () => {
    await flush(() => {
      void dialogs.confirm({ message: "m", title: "Мій заголовок", confirmLabel: "Так", cancelLabel: "Ні" });
    });

    expect(dialogEl()?.textContent).toContain("Мій заголовок");
    expect(buttons().map((b) => b.textContent)).toEqual(["Ні", "Так"]);
  });

  it("queues a second request and shows it after the first is answered", async () => {
    let first!: Promise<void>;
    let second!: Promise<boolean>;
    await flush(() => {
      first = dialogs.alert("перше");
      second = dialogs.confirm("друге");
    });

    expect(dialogEl()?.textContent).toContain("перше");
    expect(dialogEl()?.textContent).not.toContain("друге");

    await flush(() => buttonLabelled(messages.Dialog.okButton)!.click());
    await first;
    expect(dialogEl()?.textContent).toContain("друге");

    await flush(() => buttonLabelled(messages.Dialog.confirmButton)!.click());
    await expect(second).resolves.toBe(true);
    expect(dialogEl()).toBeNull();
  });
});
