"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubjectTopicsQueryKey } from "@/lib/api/browser/academics/academics";
import {
  getListTutorSubjectLessonsJsonQueryKey,
  getListTutorSubjectLessonsQueryKey,
  useListTutorSubjectLessonsJson,
  useProcessLessonsJson,
} from "@/lib/api/browser/tutor/tutor";
import type { ProcessLessonsJsonOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Every upload_to helper in common/storage.py renames files to a random hex
// name on disk (never leaks the uploader's original filename), so file_name
// isn't useful for telling LessonsJson rows apart — `name` (tutor-editable
// in the admin, defaults to "json") is the actual label; the upload date is
// shown alongside it since multiple uploads can share that default name.
const UPLOADED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Opened from the tutor's Subject detail page. Lets a tutor pick a
// scrape_lessons JSON upload (staged for this subject via the Django admin
// — see lessons.models.LessonsJson) and import it: reuses an existing Topic
// by title, creates any Lesson under it that isn't already there. See
// lessons.services.import_topics_and_lessons.
export function LoadLessonsJsonDialog({ subjectId }: { subjectId: number }) {
  const t = useTranslations("LoadLessonsJson");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<ProcessLessonsJsonOut | null>(null);

  const filesQuery = useListTutorSubjectLessonsJson(subjectId, { query: { enabled: open } });
  const processLessonsJson = useProcessLessonsJson();

  const files = filesQuery.data ?? [];
  // Defaults to the first file once the list loads, without syncing state
  // in an effect — `selectedId` only tracks an explicit user choice.
  const effectiveSelectedId = selectedId ?? files[0]?.id ?? null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelectedId(null);
      setResult(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveSelectedId === null) return;

    processLessonsJson.mutate(
      { lessonsJsonId: effectiveSelectedId },
      {
        onSuccess: (data) => {
          setResult(data);
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsJsonQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          📥 {t("triggerButton")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">📥 {t("title")}</Dialog.Title>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm font-medium text-gray-900">{t("resultHeading")}</p>
              <ul className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                <li>{t("topicsCreated", { count: result.topics_created })}</li>
                <li>{t("topicsReused", { count: result.topics_reused })}</li>
                <li>{t("lessonsCreated", { count: result.lessons_created })}</li>
                <li>{t("lessonsSkipped", { count: result.lessons_skipped })}</li>
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
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="lessons-json-file" className="text-xs font-medium text-gray-700">
                  {t("fileLabel")}
                </label>

                {filesQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
                {!filesQuery.isLoading && files.length === 0 && (
                  <p className="text-sm text-gray-500">{t("noFiles")}</p>
                )}
                {files.length > 0 && (
                  <>
                    <select
                      id="lessons-json-file"
                      value={effectiveSelectedId ?? ""}
                      onChange={(e) => setSelectedId(Number(e.target.value))}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                    >
                      {files.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.name} ({UPLOADED_AT_FORMAT.format(new Date(file.created_at))}) —{" "}
                          {file.status === "processed" ? t("statusProcessed") : t("statusNew")}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const selectedFile = files.find((file) => file.id === effectiveSelectedId);
                      return selectedFile?.file_url ? (
                        <a
                          href={selectedFile.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="self-start text-xs text-blue-600 underline hover:no-underline"
                        >
                          {t("viewFileLink")}
                        </a>
                      ) : null;
                    })()}
                  </>
                )}
              </div>

              {processLessonsJson.isError && <p className="text-sm text-red-600">{t("processError")}</p>}

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
                  disabled={effectiveSelectedId === null || processLessonsJson.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {t("loadButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
