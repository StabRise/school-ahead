"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";

// Comment-composing popup for the "Матеріали" tab's annotation panel (see
// material-annotation-panel.tsx). Deliberately a popup rather than an
// inline textarea: the sentence range being commented on is captured by the
// caller *before* this opens (passed in as `sentenceRange`, not read live
// from the selection), since opening this dialog moves focus away from the
// document and can collapse the student's text selection.
export function AddAnnotationCommentDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: string) => void;
}) {
  const t = useTranslations("MaterialAnnotationPanel");
  const [body, setBody] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    onSubmit(body.trim());
    setBody("");
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setBody("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("commentDialogTitle")}</Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <textarea
              autoFocus
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("commentPlaceholder")}
              className="rounded-md border border-gray-300 p-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t("cancelButton")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!body.trim()}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("addCommentButton")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
