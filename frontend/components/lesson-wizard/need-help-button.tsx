"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListLessonCommentsQueryKey,
  useRequestHelp,
} from "@/lib/api/browser/student-lessons/student-lessons";
import { ChatIcon } from "./chat-icon";

// The wizard's persistent "Need Help" trigger — accessible across every
// step of the wizard (content view and each assignment-step type), per the
// "State Transition & UI Rules" spec, section 2.3.
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
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
      >
        <ChatIcon />
        {t("button")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
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
      <div className="flex gap-2">
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
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
        >
          {t("cancelButton")}
        </button>
      </div>
    </div>
  );
}
