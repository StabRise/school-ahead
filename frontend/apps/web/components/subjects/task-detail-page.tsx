"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import {
  getGetSubjectTaskProgressQueryKey,
  getGetTaskQueryKey,
  getListSubjectTasksQueryKey,
  useCompleteTask,
  useGetTask,
  useSubmitTaskAnswer,
  useUncompleteTask,
} from "@school-ahead/api-client/browser/tasks/tasks";
import type { TaskOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { subjectTopicAnchorId } from "@/components/subjects/subject-anchors";
import { SimplePageContainer } from "@/components/simple/page-container";
import { Markdown } from "@/components/markdown";
import { FileDropzone } from "@/components/file-dropzone";

// The answer form's local draft state only ever needs to be initialized
// once per submission it's editing — keying this component on
// `${task.id}-${task.my_submission?.updated_at}` (see the render below)
// makes React remount it (fresh useState) whenever a newer submission
// loads, instead of syncing state from props via an effect.
function TaskAnswerForm({ task, taskId }: { task: TaskOut; taskId: number }) {
  const t = useTranslations("TaskDetail");
  const queryClient = useQueryClient();
  const submitAnswer = useSubmitTaskAnswer();

  const [text, setText] = useState(task.my_submission?.text ?? "");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    submitAnswer.mutate(
      { taskId, data: { text, file } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) }) },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-gray-200 pt-4">
      <h2 className="text-sm font-medium text-gray-900">{t("answerHeading")}</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-answer-text" className="text-sm font-medium text-gray-700">
          {t("textLabel")}
        </label>
        <textarea
          id="task-answer-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-md border border-gray-300 p-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-answer-file" className="text-sm font-medium text-gray-700">
          {t("fileLabel")}
        </label>
        <FileDropzone
          id="task-answer-file"
          hint={t("dropzoneHint")}
          multiple={false}
          onFilesSelected={(files) => setFile(files?.[0] ?? null)}
        />
        {file ? (
          <p className="text-xs text-gray-500">{file.name}</p>
        ) : (
          task.my_submission?.file && (
            <a
              href={task.my_submission.file}
              target="_blank"
              rel="noreferrer"
              className="self-start text-xs text-blue-600 underline hover:no-underline"
            >
              {t("viewSubmittedFile")}
            </a>
          )
        )}
      </div>

      {submitAnswer.isError && <p className="text-sm text-red-600">{t("submitError")}</p>}

      <button
        type="submit"
        disabled={submitAnswer.isPending || (!text.trim() && !file)}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
      >
        {submitAnswer.isPending ? t("submitting") : t("submitButton")}
      </button>
    </form>
  );
}

// The student's Task detail page (/tasks/[taskId]) — reached by clicking a
// task's title in the Subject detail page's Tasks tab. Shows the tutor's
// content (markdown or image) plus a one-shot "answer" form (free text
// and/or an attached file, see tasks.api.submit_task_answer) — independent
// of the done/not-done toggle, which also lives here for convenience (the
// list row's own toggle is the faster path for marking done without
// opening this page).
export function TaskDetailPage({ taskId }: { taskId: number }) {
  const t = useTranslations("TaskDetail");
  const queryClient = useQueryClient();
  const taskQuery = useGetTask(taskId);
  const task = taskQuery.data;

  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();

  if (taskQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (taskQuery.isError || !task) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const doneMutation = task.is_done ? uncompleteTask : completeTask;
  const handleToggleDone = () => {
    doneMutation.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
          queryClient.invalidateQueries({ queryKey: getListSubjectTasksQueryKey(task.subject_id) });
          queryClient.invalidateQueries({ queryKey: getGetSubjectTaskProgressQueryKey(task.subject_id) });
        },
      },
    );
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/subjects" },
    { label: task.subject_name, href: `/subjects/${task.subject_id}` },
    { label: task.topic_title, href: `/subjects/${task.subject_id}#${subjectTopicAnchorId(task.topic_id)}` },
    { label: task.title },
  ];

  return (
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleDone}
              disabled={doneMutation.isPending}
              aria-pressed={task.is_done}
              aria-label={task.is_done ? t("markNotDoneButton") : t("markDoneButton")}
              title={task.is_done ? t("markNotDoneButton") : t("markDoneButton")}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                task.is_done
                  ? "text-green-600 hover:bg-green-50"
                  : "text-gray-300 hover:bg-gray-100 hover:text-gray-400"
              }`}
            >
              {task.is_done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
            </button>
            <h1 className="text-xl font-semibold text-gray-900">{task.title}</h1>
          </div>
          <p className="text-xs text-gray-500">{task.is_done ? t("statusDone") : t("statusNotDone")}</p>
        </div>

        <div>
          {task.kind === "markdown" ? (
            <Markdown content={task.content} />
          ) : (
            task.image && (
              <img src={task.image} alt={task.title} className="max-h-[60vh] w-full rounded-md object-contain" />
            )
          )}
        </div>

        <TaskAnswerForm key={`${task.id}-${task.my_submission?.updated_at ?? ""}`} task={task} taskId={taskId} />
      </div>
    </SimplePageContainer>
  );
}
