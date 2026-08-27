"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useSchedulingApiReschedule } from "@/lib/api/browser/schedule/schedule";

// Opened from the tutor's Subject detail page ("Вигляд по учню" mode) to
// change the scheduled date of an already-assigned lesson — reuses the same
// reschedule endpoint the student's own calendar drag-and-drop uses
// (POST /api/schedule/student-lessons/{id}/reschedule), just from a popup
// instead of a drag gesture. Unlike AssignStudentDialog, this only edits an
// existing StudentLesson, so there's no student picker — just the date.
export function RescheduleAssignmentDialog({
  studentLessonId,
  currentDate,
  trigger,
  onRescheduled,
}: {
  studentLessonId: number;
  currentDate: string;
  trigger: ReactNode;
  onRescheduled?: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const [open, setOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(currentDate);
  const reschedule = useSchedulingApiReschedule();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    reschedule.mutate(
      { studentLessonId, data: { scheduled_date: scheduledDate } },
      {
        onSuccess: () => {
          setOpen(false);
          onRescheduled?.();
        },
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setScheduledDate(currentDate);
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" onClick={(e) => e.stopPropagation()} />
        {/* Portaled to document.body, so DOM-wise this sits outside the lesson
            row's <a> — but React's synthetic events bubble the *React* tree,
            not the DOM tree, so a click here would otherwise still reach and
            navigate that surrounding Link. Stop it from escaping the dialog. */}
        <Dialog.Content
          onClick={(e) => e.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg"
        >
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("editAssignmentDateTitle")}</Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="reschedule-date" className="text-xs font-medium text-gray-700">
                {t("assignDateLabel")}
              </label>
              <input
                id="reschedule-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              />
            </div>

            {reschedule.isError && <p className="text-sm text-red-600">{t("rescheduleError")}</p>}

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
                disabled={reschedule.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("saveButton")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
