"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListLessonCommentsQueryKey,
  useRequestHelp,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { ChatIcon } from "./chat-icon";

// The wizard's persistent "Need Help" trigger — accessible across every
// step of the wizard (content view and each assignment-step type), per the
// "State Transition & UI Rules" spec, section 2.3. Rendered as a floating
// action button fixed to the bottom-right corner so it stays reachable
// regardless of scroll position or which wizard step is active.
export function NeedHelpButton({
  studentLessonId,
  onRequested,
}: {
  studentLessonId: number;
  onRequested: () => void;
}) {
  const t = useTranslations("NeedHelp");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const requestHelp = useRequestHelp();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("button")}
        title={t("button")}
        className="fixed right-6 bottom-6 z-40 flex size-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition hover:bg-amber-600 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        <ChatIcon className="size-6" />
      </button>
    );
  }

  return (
    <div className="fixed right-6 bottom-6 z-40 flex w-80 max-w-[calc(100vw-3rem)] flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
      <label className="text-sm font-medium" htmlFor="need-help-note">
        {t("noteLabel")}
      </label>
      <textarea
        id="need-help-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="rounded-md border border-gray-300 p-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
        >
          {t("cancelButton")}
        </button>
        <button
          type="button"
          disabled={requestHelp.isPending}
          onClick={() =>
            requestHelp.mutate(
              { studentLessonId, data: { note } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: getListLessonCommentsQueryKey(studentLessonId),
                  });
                  setNote("");
                  setOpen(false);
                  onRequested();
                },
              },
            )
          }
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("sendButton")}
        </button>
      </div>
    </div>
  );
}
