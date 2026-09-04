"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { useSubmitTask, useResubmitLesson } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { Markdown } from "@/components/markdown";
import { FileDropzone } from "@/components/file-dropzone";

// A submission needs at least one file or a written comment — never neither.
const taskSubmissionSchema = z
  .object({
    comment: z.string(),
    files: z.array(z.instanceof(File)),
  })
  .refine((data) => data.files.length > 0 || data.comment.trim().length > 0, {
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

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<TaskSubmissionValues>({
    resolver: zodResolver(taskSubmissionSchema),
    defaultValues: { comment: "", files: [] },
  });

  const onSubmit = (data: TaskSubmissionValues) => {
    mutation.mutate(
      { studentLessonId, data: { comment: data.comment, files: data.files } },
      { onSuccess: () => onChanged() },
    );
  };

  // Picking/dropping more files adds to the current selection rather than
  // replacing it, so a student can build up a batch across several drops or
  // picker opens instead of losing earlier picks.
  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next = [...selectedFiles, ...Array.from(fileList)];
    setSelectedFiles(next);
    setValue("files", next, { shouldValidate: true });
  };

  const removeFile = (index: number) => {
    const next = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(next);
    setValue("files", next, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {taskContent && <Markdown content={taskContent} embedYoutube embedPdf />}

      <div className="flex flex-col gap-1">
        <label htmlFor="task-comment" className="text-sm font-medium text-gray-700">
          {t("commentLabel")}
        </label>
        <textarea
          id="task-comment"
          rows={3}
          className="rounded-md border border-gray-300 p-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          {...register("comment")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-file" className="text-sm font-medium text-gray-700">
          {t("fileLabel")}
        </label>
        <FileDropzone id="task-file" hint={t("dropzoneHint")} onFilesSelected={addFiles} />

        {selectedFiles.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {selectedFiles.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={t("removeFile")}
                  className="shrink-0 text-gray-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {errors.comment && <p className="text-sm text-red-600">{t("requiredError")}</p>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {isResubmit ? t("resubmitButton") : t("submitButton")}
      </button>
    </form>
  );
}
