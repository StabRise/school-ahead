"use client";

import { createContext, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { createDialogQueue, type PendingDialog } from "@/lib/dialog-queue";

// The app's one modal for messages and yes/no questions — use it wherever
// window.alert / window.confirm would go. Await the result:
//
//   const dialogs = useDialogs();
//   if (!(await dialogs.confirm({ message: t("deleteConfirm"), tone: "danger" }))) return;
//   deleteThing.mutate(..., { onError: () => dialogs.error(t("deleteError")) });
//
//   alert   — a message with an OK button
//   error   — the same, titled and coloured as a failure
//   confirm — OK / Cancel; resolves true only when confirmed. `tone: "danger"`
//             makes the confirm button red, for deletions.
//
// Unlike the native ones these don't block the page, so a request made while
// one is open waits its turn (see lib/dialog-queue.ts). Mounted once, in
// app/providers.tsx.
export interface DialogOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ConfirmOptions extends DialogOptions {
  tone?: "default" | "danger";
}

export interface Dialogs {
  alert: (options: string | DialogOptions) => Promise<void>;
  error: (options: string | DialogOptions) => Promise<void>;
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
}

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const dialogs = useContext(DialogsContext);
  if (!dialogs) throw new Error("useDialogs must be used inside <DialogProvider>");
  return dialogs;
}

const asOptions = <T extends DialogOptions>(options: string | T): T =>
  (typeof options === "string" ? { message: options } : options) as T;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(createDialogQueue);
  const current = useSyncExternalStore(queue.subscribe, queue.current, queue.current);

  const dialogs = useMemo<Dialogs>(
    () => ({
      alert: async (options) => {
        await queue.ask({ kind: "alert", ...asOptions(options) });
      },
      error: async (options) => {
        await queue.ask({ kind: "alert", tone: "danger", ...asOptions(options) });
      },
      confirm: (options) => queue.ask({ kind: "confirm", ...asOptions(options) }),
    }),
    [queue],
  );

  return (
    <DialogsContext.Provider value={dialogs}>
      {children}
      {current && <AppDialog key={current.id} dialog={current} onSettle={queue.settle} />}
    </DialogsContext.Provider>
  );
}

function AppDialog({ dialog, onSettle }: { dialog: PendingDialog; onSettle: (value: boolean) => void }) {
  const t = useTranslations("Dialog");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isConfirm = dialog.kind === "confirm";
  const isDanger = dialog.tone === "danger";

  const title = dialog.title ?? (isConfirm ? t("confirmTitle") : isDanger ? t("errorTitle") : t("alertTitle"));
  const confirmLabel = dialog.confirmLabel ?? (isConfirm ? t("confirmButton") : t("okButton"));

  return (
    // Escape or a click on the backdrop dismisses it — answered "no" for a
    // question, and just acknowledged for a message.
    <Dialog.Root open onOpenChange={(open) => !open && onSettle(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content
          // A question focuses "Cancel", so a stray Enter can't confirm a
          // deletion; a message focuses its only button (Radix's default).
          onOpenAutoFocus={(event) => {
            if (!isConfirm) return;
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className={`text-lg font-semibold ${!isConfirm && isDanger ? "text-red-700" : "text-gray-900"}`}>
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-gray-700">
            {dialog.message}
          </Dialog.Description>

          <div className="mt-6 flex justify-end gap-2">
            {isConfirm && (
              <button
                ref={cancelRef}
                type="button"
                onClick={() => onSettle(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {dialog.cancelLabel ?? t("cancelButton")}
              </button>
            )}
            <button
              type="button"
              onClick={() => onSettle(true)}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                isConfirm && isDanger ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
