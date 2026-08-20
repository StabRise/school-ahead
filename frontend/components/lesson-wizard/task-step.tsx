"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSubmitTask, useResubmitLesson } from "@/lib/api/browser/student-lessons/student-lessons";
import { Markdown } from "@/components/markdown";

export function TaskStep({
  studentLessonId,
  taskContent,
  isResubmit,
  onChanged,
}: {
  studentLessonId: number;
  taskContent: string;
  isResubmit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("TaskStep");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const submitTask = useSubmitTask();
  const resubmitLesson = useResubmitLesson();

  const mutation = isResubmit ? resubmitLesson : submitTask;

  const handleSubmit = () => {
    mutation.mutate(
      { studentLessonId, data: { comment, file } },
      { onSuccess: () => onChanged() },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {taskContent && <Markdown content={taskContent} embedYoutube />}

      <div className="flex flex-col gap-1">
        <label htmlFor="task-comment" className="text-sm font-medium">
          {t("commentLabel")}
        </label>
        <textarea
          id="task-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="rounded-md border border-gray-300 p-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-file" className="text-sm font-medium">
          {t("fileLabel")}
        </label>
        <input
          id="task-file"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>

      <button
        type="button"
        disabled={mutation.isPending}
        onClick={handleSubmit}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isResubmit ? t("resubmitButton") : t("submitButton")}
      </button>
    </div>
  );
}
