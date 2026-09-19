// The state behind the app's modal dialogs (components/dialogs/app-dialogs.tsx),
// kept free of React so it can be tested on its own. Each `ask` returns a
// promise the caller awaits, in place of the blocking window.alert/confirm —
// and where those queue naturally by blocking, this queues by hand: a second
// request made while one is open waits its turn, shown right after.
export interface DialogRequest {
  kind: "alert" | "confirm";
  title?: string;
  message: string;
  // "danger" turns the confirm button red (a delete) and titles an alert as an
  // error.
  tone?: "default" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PendingDialog extends DialogRequest {
  id: number;
}

interface QueueEntry {
  dialog: PendingDialog;
  resolve: (value: boolean) => void;
}

export function createDialogQueue() {
  let entries: QueueEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  return {
    // Resolves true when the user confirmed (or acknowledged an alert), false
    // when they cancelled or dismissed it.
    ask(request: DialogRequest): Promise<boolean> {
      return new Promise((resolve) => {
        entries = [...entries, { dialog: { ...request, id: nextId++ }, resolve }];
        emit();
      });
    },

    // Answers the dialog on screen and moves on to the next waiting one. A no-op
    // when nothing is open, so a stray second answer can't skip a dialog.
    settle(value: boolean): void {
      const [head, ...rest] = entries;
      if (!head) return;
      entries = rest;
      emit();
      head.resolve(value);
    },

    // The dialog to show now. The same object until it is answered — what
    // useSyncExternalStore needs from a snapshot.
    current(): PendingDialog | null {
      return entries[0]?.dialog ?? null;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
