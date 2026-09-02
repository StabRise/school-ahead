"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "@/i18n/navigation";
import { useAddMaterial, useListMyAssignableLessons } from "@/lib/api/browser/student-lessons/student-lessons";
import type { SpeechLanguage } from "@/lib/piper-tts";
import type { ReadingBlock } from "@/lib/reading-blocks";

// Saves the read-along page's currently loaded content onto one of the
// student's own assigned, not-yet-completed lessons — see
// backend/lessons/api.py's list_my_assignable_lessons/add_material.
// Controlled (no Dialog.Trigger): opened via
// ReadAlongControlPanel's "Додати в урок" icon button, which lives inside
// the fixed bottom bar rather than right next to this dialog, unlike
// components/calendar/add-day-lesson-dialog.tsx's otherwise-identical
// @radix-ui/react-dialog usage.
export function AddMaterialDialog({
  open,
  onOpenChange,
  blocks,
  title,
  sourceUrl,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: ReadingBlock[];
  title: string | null;
  sourceUrl: string;
  language: SpeechLanguage;
}) {
  const t = useTranslations("AddMaterialDialog");
  const router = useRouter();
  const [studentLessonId, setStudentLessonId] = useState<number | "">("");

  const lessonsQuery = useListMyAssignableLessons({ query: { enabled: open } });
  const lessons = lessonsQuery.data ?? [];
  const noLessons = !lessonsQuery.isLoading && !lessonsQuery.isError && lessons.length === 0;
  const effectiveLessonId: number | "" = studentLessonId !== "" ? studentLessonId : (lessons.at(0)?.id ?? "");

  const addMaterial = useAddMaterial();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveLessonId === "") return;

    const targetLessonId = effectiveLessonId;
    addMaterial.mutate(
      {
        studentLessonId: targetLessonId,
        data: { title: title ?? "", content: blocks, source_url: sourceUrl, language },
      },
      {
        onSuccess: (createdMaterial) => {
          setStudentLessonId("");
          onOpenChange(false);
          // Each material has its own link (?material=<id>) — see
          // components/lesson-wizard/materials-step.tsx — so this lands
          // directly on the one just added even if the lesson has others.
          router.push(`/lessons/${targetLessonId}?step=readingMaterials&material=${createdMaterial.id}`);
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("title")}</Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-material-lesson" className="text-xs font-medium text-gray-700">
                {t("lessonLabel")}
              </label>
              <select
                id="add-material-lesson"
                value={effectiveLessonId}
                onChange={(e) => setStudentLessonId(e.target.value ? Number(e.target.value) : "")}
                disabled={lessonsQuery.isLoading || noLessons}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              >
                {lessons.length === 0 && <option value="">{t("lessonPlaceholder")}</option>}
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title} — {lesson.subject_name} ({lesson.scheduled_date})
                  </option>
                ))}
              </select>
              {noLessons && <p className="text-sm text-gray-500">{t("noAssignableLessons")}</p>}
            </div>

            {addMaterial.isError && <p className="text-sm text-red-600">{t("error")}</p>}

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
                disabled={effectiveLessonId === "" || addMaterial.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("submitButton")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
