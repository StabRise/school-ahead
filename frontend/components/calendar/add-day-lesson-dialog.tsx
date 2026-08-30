"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListStudentAssignableLessonsQueryKey,
  useAssignDayLesson,
  useListStudentAssignableLessons,
  useListStudentSubjects,
} from "@/lib/api/browser/tutor/tutor";
import { MarkdownEditor } from "@/components/markdown-editor";

// The "+" popup opened from a day column on the tutor's "View calendar" page
// for a student (WeeklyCalendar, studentId set) — assigns a lesson to that
// day, either picking one of the subject's not-yet-assigned lessons (in
// curriculum order) or authoring a one-off lesson on the spot (saved under
// the subject's "Extra" topic — see backend tutoring.api.assign_day_lesson).
export function AddDayLessonDialog({
  studentId,
  scheduledDate,
  trigger,
  onAssigned,
}: {
  studentId: number;
  scheduledDate: string;
  trigger?: ReactNode;
  onAssigned?: () => void;
}) {
  const t = useTranslations("Calendar");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [subjectId, setSubjectId] = useState<number | "">("");
  const [isNew, setIsNew] = useState(false);
  const [lessonId, setLessonId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [taskContent, setTaskContent] = useState("");

  const subjectsQuery = useListStudentSubjects(studentId, { query: { enabled: open } });
  const subjects = subjectsQuery.data ?? [];
  const noSubjects = !subjectsQuery.isLoading && !subjectsQuery.isError && subjects.length === 0;
  const effectiveSubjectId: number | "" = subjectId !== "" ? subjectId : (subjects.at(0)?.subject_id ?? "");

  const lessonsQuery = useListStudentAssignableLessons(
    studentId,
    effectiveSubjectId === "" ? 0 : effectiveSubjectId,
    { query: { enabled: open && !isNew && effectiveSubjectId !== "" } },
  );
  const lessons = lessonsQuery.data ?? [];
  const noAssignableLessons = !lessonsQuery.isLoading && !lessonsQuery.isError && lessons.length === 0;
  const effectiveLessonId: number | "" = lessonId !== "" ? lessonId : (lessons.at(0)?.id ?? "");

  const assignMutation = useAssignDayLesson();

  const reset = () => {
    setSubjectId("");
    setIsNew(false);
    setLessonId("");
    setTitle("");
    setContent("");
    setTaskContent("");
  };

  const canSubmit =
    effectiveSubjectId !== "" &&
    (isNew ? title.trim() !== "" && content.trim() !== "" : effectiveLessonId !== "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const subjectIdForSubmit = effectiveSubjectId as number;

    assignMutation.mutate(
      {
        studentId,
        data: {
          subject_id: subjectIdForSubmit,
          scheduled_date: scheduledDate,
          is_new: isNew,
          ...(isNew
            ? { title, content, task_content: taskContent }
            : { lesson_id: effectiveLessonId as number }),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListStudentAssignableLessonsQueryKey(studentId, subjectIdForSubmit),
          });
          reset();
          setOpen(false);
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
        if (!next) reset();
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            title={t("addLesson")}
            aria-label={t("addLesson")}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-base font-semibold leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            +
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("addLessonTitle")}</Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-lesson-subject" className="text-xs font-medium text-gray-700">
                {t("addLessonSubjectLabel")}
              </label>
              <select
                id="add-lesson-subject"
                value={effectiveSubjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value ? Number(e.target.value) : "");
                  setLessonId("");
                }}
                disabled={subjectsQuery.isLoading || noSubjects}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              >
                {subjects.length === 0 && <option value="">{t("addLessonSubjectPlaceholder")}</option>}
                {subjects.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.subject_name}
                  </option>
                ))}
              </select>
              {noSubjects && <p className="text-sm text-gray-500">{t("addLessonNoSubjects")}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isNew}
                onChange={(e) => {
                  setIsNew(e.target.checked);
                  setLessonId("");
                }}
              />
              {t("addLessonIsNewLabel")}
            </label>

            {isNew ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="add-lesson-title" className="text-xs font-medium text-gray-700">
                    {t("addLessonTitleLabel")}
                  </label>
                  <input
                    id="add-lesson-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">{t("addLessonContentLabel")}</label>
                  <MarkdownEditor value={content} onChange={setContent} rows={6} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">{t("addLessonTaskContentLabel")}</label>
                  <MarkdownEditor value={taskContent} onChange={setTaskContent} rows={4} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label htmlFor="add-lesson-existing" className="text-xs font-medium text-gray-700">
                  {t("addLessonExistingLabel")}
                </label>
                <select
                  id="add-lesson-existing"
                  value={effectiveLessonId}
                  onChange={(e) => setLessonId(e.target.value ? Number(e.target.value) : "")}
                  disabled={effectiveSubjectId === "" || lessonsQuery.isLoading || noAssignableLessons}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                >
                  {lessons.length === 0 && <option value="">{t("addLessonExistingPlaceholder")}</option>}
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.topic_title} — {l.title}
                    </option>
                  ))}
                </select>
                {noAssignableLessons && <p className="text-sm text-gray-500">{t("addLessonNoAssignableLessons")}</p>}
              </div>
            )}

            {assignMutation.isError && <p className="text-sm text-red-600">{t("addLessonError")}</p>}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t("rescheduleCancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!canSubmit || assignMutation.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("addLessonSubmit")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
