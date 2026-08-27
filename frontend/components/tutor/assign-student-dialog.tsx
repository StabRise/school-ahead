"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAssignableStudentsQueryKey,
  getListTutorLessonStudentsQueryKey,
  useAssignLessonToStudent,
  useListAssignableStudents,
} from "@/lib/api/browser/tutor/tutor";
import { todayIso } from "@/lib/dates";

// Shared by the tutor's Lesson detail page (default text trigger) and the
// Subject detail page (icon trigger per lesson row, optionally pre-selecting
// the student from "Вигляд по учню" via `defaultStudentId`) — same popup:
// pick a student (defaulting to the class's first assignable one, or
// `defaultStudentId` when it's still assignable) and a scheduled date.
//
// The trigger button is always rendered/enabled — the picker inside the
// popup is what's limited to students in the lesson's class without a
// StudentLesson yet (backend-filtered); assigning one moves it off this
// list and onto the assigned list.
export function AssignStudentDialog({
  lessonId,
  defaultStudentId,
  trigger,
  onAssigned,
}: {
  lessonId: number;
  defaultStudentId?: number;
  trigger?: ReactNode;
  onAssigned?: () => void;
}) {
  const t = useTranslations("TutorLessonDetail");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const assignableQuery = useListAssignableStudents(lessonId, { query: { enabled: open } });
  const assignMutation = useAssignLessonToStudent();

  // Only tracks an explicit user choice — defaults to `defaultStudentId` (if
  // still assignable) or otherwise the first student in the class
  // (already name-ordered by the backend) once the list loads, without
  // syncing state in an effect. Same pattern as LoadLessonsJsonDialog's
  // `effectiveSelectedId`.
  const [studentId, setStudentId] = useState<number | "">("");
  const [scheduledDate, setScheduledDate] = useState(todayIso);

  const students = assignableQuery.data ?? [];
  const noAssignableStudents = !assignableQuery.isLoading && !assignableQuery.isError && students.length === 0;
  const defaultStillAssignable = defaultStudentId !== undefined && students.some((s) => s.id === defaultStudentId);
  const effectiveStudentId: number | "" =
    studentId !== ""
      ? studentId
      : defaultStillAssignable
        ? defaultStudentId!
        : (students.at(0)?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveStudentId === "") return;

    assignMutation.mutate(
      { lessonId, data: { student_id: effectiveStudentId, scheduled_date: scheduledDate } },
      {
        onSuccess: () => {
          setStudentId("");
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: getListAssignableStudentsQueryKey(lessonId) });
          queryClient.invalidateQueries({ queryKey: getListTutorLessonStudentsQueryKey(lessonId) });
          onAssigned?.();
        },
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setStudentId("");
          setScheduledDate(todayIso());
        }
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("assignToStudentButton")}
          </button>
        )}
      </Dialog.Trigger>
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
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            {t("assignToStudentButton")}
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="assign-student" className="text-xs font-medium text-gray-700">
                {t("assignStudentLabel")}
              </label>
              <select
                id="assign-student"
                value={effectiveStudentId}
                onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}
                disabled={assignableQuery.isLoading || noAssignableStudents}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              >
                {students.length === 0 && <option value="">{t("assignStudentPlaceholder")}</option>}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {noAssignableStudents && <p className="text-sm text-gray-500">{t("noAssignableStudents")}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="assign-date" className="text-xs font-medium text-gray-700">
                {t("assignDateLabel")}
              </label>
              <input
                id="assign-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              />
            </div>

            {assignMutation.isError && <p className="text-sm text-red-600">{t("assignError")}</p>}

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
                disabled={effectiveStudentId === "" || assignMutation.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("assignButton")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
