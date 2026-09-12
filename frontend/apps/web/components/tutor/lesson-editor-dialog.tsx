"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useCreateTutorLesson } from "@school-ahead/api-client/browser/tutor/tutor";
import { MarkdownEditor } from "@school-ahead/markdown-editor";

type LessonTypeValue = "theory" | "with_task";
type GradingTypeValue = "points" | "binary";

// Quiz lessons aren't offered here (unlike the edit form on the Lesson
// detail page's LESSON_TYPE_OPTIONS) — there's no UI yet to author quiz
// questions by hand, so creating one would leave a dead-end empty quiz.
// Same reasoning tutoring.services.create_extra_lesson already applies.
const LESSON_TYPE_OPTIONS: { value: LessonTypeValue; labelKey: string }[] = [
  { value: "theory", labelKey: "contentTheory" },
  { value: "with_task", labelKey: "contentTask" },
];

const GRADING_TYPE_OPTIONS: { value: GradingTypeValue; labelKey: string }[] = [
  { value: "points", labelKey: "gradingTypePoints" },
  { value: "binary", labelKey: "gradingTypeBinary" },
];

// Create-only dialog for manually adding a single Lesson to an existing
// Topic — the tutor's "+" button on a TopicSection (Subject detail page).
// `topicId` is fixed by the caller (the section it's opened from), so
// unlike TaskEditorDialog there's no topic picker.
export function LessonEditorDialog({
  topicId,
  trigger,
  onCreated,
}: {
  topicId: number;
  trigger: React.ReactNode;
  onCreated: () => void;
}) {
  const t = useTranslations("LessonEditor");
  // lesson_type/grading_type option labels reuse the same translations the
  // Lesson detail page's edit form and ContentTypeBadges already use,
  // rather than duplicating them under a new namespace.
  const tContentType = useTranslations("SubjectDetail");
  const tGrading = useTranslations("TutorLessonDetail");
  const createLesson = useCreateTutorLesson();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [lessonType, setLessonType] = useState<LessonTypeValue>("theory");
  const [gradingType, setGradingType] = useState<GradingTypeValue>("points");
  const [content, setContent] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [synopsis, setSynopsis] = useState("");

  const reset = () => {
    setTitle("");
    setLessonType("theory");
    setGradingType("points");
    setContent("");
    setTaskContent("");
    setSynopsis("");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const canSubmit = title.trim() !== "" && content.trim() !== "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    createLesson.mutate(
      {
        data: {
          topic_id: topicId,
          title,
          content,
          task_content: lessonType === "with_task" ? taskContent : "",
          synopsis,
          lesson_type: lessonType,
          grading_type: gradingType,
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          onCreated();
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("createTitle")}</Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="lesson-editor-title" className="text-xs font-medium text-gray-700">
                {t("titleLabel")}
              </label>
              <input
                id="lesson-editor-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="lesson-editor-type" className="text-xs font-medium text-gray-700">
                  {t("lessonTypeLabel")}
                </label>
                <select
                  id="lesson-editor-type"
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value as LessonTypeValue)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                >
                  {LESSON_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tContentType(option.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="lesson-editor-grading" className="text-xs font-medium text-gray-700">
                  {tGrading("gradingTypeLabel")}
                </label>
                <select
                  id="lesson-editor-grading"
                  value={gradingType}
                  onChange={(e) => setGradingType(e.target.value as GradingTypeValue)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                >
                  {GRADING_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tGrading(option.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">{t("contentLabel")}</label>
              <MarkdownEditor value={content} onChange={setContent} rows={6} />
            </div>

            {lessonType === "with_task" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">{t("taskContentLabel")}</label>
                <MarkdownEditor value={taskContent} onChange={setTaskContent} rows={4} />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">{t("synopsisLabel")}</label>
              <p className="text-xs text-gray-500">{t("synopsisHint")}</p>
              <MarkdownEditor value={synopsis} onChange={setSynopsis} rows={4} />
            </div>

            {createLesson.isError && <p className="text-sm text-red-600">{t("saveError")}</p>}

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
                disabled={!canSubmit || createLesson.isPending}
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
