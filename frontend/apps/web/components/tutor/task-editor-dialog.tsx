"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSubjectTaskProgressQueryKey,
  getListSubjectTasksQueryKey,
  useCreateTask,
  useUpdateTask,
} from "@school-ahead/api-client/browser/tasks/tasks";
import type { TaskOut, TopicOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { MarkdownEditor } from "@/components/markdown-editor";
import { FileDropzone } from "@/components/file-dropzone";

type TaskKindValue = "markdown" | "image";

// Create/edit dialog for a tutor's Task — same Dialog.Root + trigger-prop
// shape as LoadLessonsJsonDialog. `task` omitted = create mode (starting on
// the first topic); passed = edit mode, prefilled from it. Multipart
// create/update mutations take {title, topic_id, kind, content, image}
// directly — the generated hook builds the FormData internally.
export function TaskEditorDialog({
  subjectId,
  topics,
  task,
  trigger,
}: {
  subjectId: number;
  topics: TopicOut[];
  task?: TaskOut;
  trigger: React.ReactNode;
}) {
  const t = useTranslations("TaskEditor");
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const mutation = task ? updateTask : createTask;

  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState<number | "">(task?.topic_id ?? topics[0]?.id ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [kind, setKind] = useState<TaskKindValue>((task?.kind as TaskKindValue) ?? "markdown");
  const [content, setContent] = useState(task?.content ?? "");
  const [image, setImage] = useState<File | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTopicId(task?.topic_id ?? topics[0]?.id ?? "");
      setTitle(task?.title ?? "");
      setKind((task?.kind as TaskKindValue) ?? "markdown");
      setContent(task?.content ?? "");
      setImage(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topicId === "") return;

    const data = { topic_id: topicId, title, kind, content, image };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListSubjectTasksQueryKey(subjectId) });
      queryClient.invalidateQueries({ queryKey: getGetSubjectTaskProgressQueryKey(subjectId) });
      setOpen(false);
    };

    if (task) {
      updateTask.mutate({ taskId: task.id, data }, { onSuccess });
    } else {
      createTask.mutate({ data }, { onSuccess });
    }
  };

  const canSubmit = kind === "markdown" ? content.trim().length > 0 : image !== null || Boolean(task?.image);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            {task ? t("editTitle") : t("createTitle")}
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-topic" className="text-xs font-medium text-gray-700">
                {t("topicLabel")}
              </label>
              <select
                id="task-topic"
                required
                value={topicId}
                onChange={(e) => setTopicId(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              >
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="task-title" className="text-xs font-medium text-gray-700">
                {t("titleLabel")}
              </label>
              <input
                id="task-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              />
            </div>

            <div className="flex gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="task-kind"
                  checked={kind === "markdown"}
                  onChange={() => setKind("markdown")}
                />
                {t("kindMarkdown")}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="task-kind" checked={kind === "image"} onChange={() => setKind("image")} />
                {t("kindImage")}
              </label>
            </div>

            {kind === "markdown" ? (
              <MarkdownEditor value={content} onChange={setContent} rows={6} />
            ) : (
              <div className="flex flex-col gap-1">
                <FileDropzone
                  id="task-image"
                  hint={t("dropzoneHint")}
                  multiple={false}
                  onFilesSelected={(files) => setImage(files?.[0] ?? null)}
                />
                {image && <p className="text-xs text-gray-500">{image.name}</p>}
                {!image && task?.image && <p className="text-xs text-gray-500">{t("keepExistingImage")}</p>}
              </div>
            )}

            {mutation.isError && <p className="text-sm text-red-600">{t("saveError")}</p>}

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
                disabled={!canSubmit || mutation.isPending}
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
