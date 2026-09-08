"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSubjectTaskProgressQueryKey,
  getListSubjectTasksQueryKey,
  useImportSubjectTasksMarkdown,
} from "@school-ahead/api-client/browser/tasks/tasks";
import { getListSubjectTopicsQueryKey } from "@school-ahead/api-client/browser/academics/academics";
import type { TaskImportSummaryOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Opened from the tutor's Subject detail page Tasks tab. Single-step, same
// shape as UploadPlanDialog: pick a file and it's parsed+imported
// immediately (see tasks.services.parse_tasks_markdown/import_tasks_markdown)
// — a `## <topic>` heading per Topic (reused by exact title match, created
// otherwise), one Task per non-blank line under it.
export function LoadTasksMarkdownDialog({ subjectId }: { subjectId: number }) {
  const t = useTranslations("LoadTasksMarkdown");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<TaskImportSummaryOut | null>(null);

  const importTasksMarkdown = useImportSubjectTasksMarkdown();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setFile(null);
      setResult(null);
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    importTasksMarkdown.mutate(
      { subjectId, data: { file } },
      {
        onSuccess: (data) => {
          setResult(data);
          queryClient.invalidateQueries({ queryKey: getListSubjectTasksQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getGetSubjectTaskProgressQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("triggerButton")}
          aria-label={t("triggerButton")}
          className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {t("triggerButton")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">📥 {t("title")}</Dialog.Title>
          <p className="mt-1 text-xs text-gray-500">{t("description")}</p>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <ul className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                <li>{t("topicsCreated", { count: result.topics_created })}</li>
                <li>{t("topicsReused", { count: result.topics_reused })}</li>
                <li>{t("tasksCreated", { count: result.tasks_created })}</li>
                <li>{t("tasksSkipped", { count: result.tasks_skipped })}</li>
              </ul>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="self-end rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  {t("closeButton")}
                </button>
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={handleUpload} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="tasks-markdown-file" className="text-xs font-medium text-gray-700">
                  {t("fileLabel")}
                </label>
                <input
                  id="tasks-markdown-file"
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-700"
                />
                <p className="text-xs text-gray-500">{t("fileHint")}</p>
              </div>

              {importTasksMarkdown.isError && <p className="text-sm text-red-600">{t("uploadError")}</p>}

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
                  disabled={!file || importTasksMarkdown.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {importTasksMarkdown.isPending ? t("uploading") : t("uploadButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
