"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSubmitTask, useResubmitLesson } from "@/lib/api/browser/student-lessons/student-lessons";
import { Markdown } from "@/components/markdown";

// A submission needs a file or a written comment — never neither.
const taskSubmissionSchema = z
  .object({
    comment: z.string(),
    file: z.instanceof(File).nullable(),
  })
  .refine((data) => data.file !== null || data.comment.trim().length > 0, {
    message: "required",
    path: ["comment"],
  });

type TaskSubmissionValues = z.infer<typeof taskSubmissionSchema>;

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
  const submitTask = useSubmitTask();
  const resubmitLesson = useResubmitLesson();

  const mutation = isResubmit ? resubmitLesson : submitTask;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<TaskSubmissionValues>({
    resolver: zodResolver(taskSubmissionSchema),
    defaultValues: { comment: "", file: null },
  });

  const onSubmit = (data: TaskSubmissionValues) => {
    mutation.mutate(
      { studentLessonId, data: { comment: data.comment, file: data.file } },
      { onSuccess: () => onChanged() },
    );
  };

  const selectFile = (files: FileList | null) => {
    const file = files?.[0] ?? null;
    setSelectedFile(file);
    setValue("file", file, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {taskContent && <Markdown content={taskContent} embedYoutube embedPdf />}

      <div className="flex flex-col gap-1">
        <label htmlFor="task-comment" className="text-sm font-medium">
          {t("commentLabel")}
        </label>
        <textarea
          id="task-comment"
          rows={3}
          className="rounded-md border border-gray-300 p-2 text-sm"
          {...register("comment")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-file" className="text-sm font-medium">
          {t("fileLabel")}
        </label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            selectFile(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-center transition-colors ${
            isDragging ? "border-gray-900 bg-gray-50" : "border-gray-300"
          }`}
        >
          {selectedFile ? (
            <div className="flex items-center gap-2 text-sm">
              <span>{selectedFile.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectFile(null);
                }}
                className="text-red-600 underline"
              >
                {t("removeFile")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("dropzoneHint")}</p>
          )}
          <input
            ref={fileInputRef}
            id="task-file"
            type="file"
            className="hidden"
            onChange={(e) => selectFile(e.target.files)}
          />
        </div>
      </div>

      {errors.comment && <p className="text-sm text-red-600">{t("requiredError")}</p>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isResubmit ? t("resubmitButton") : t("submitButton")}
      </button>
    </form>
  );
}
