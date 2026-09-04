"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubjectTopicsQueryKey } from "@school-ahead/api-client/browser/academics/academics";
import {
  getListTutorSubjectLessonsJsonQueryKey,
  getListTutorSubjectLessonsQueryKey,
  useProcessLessonsJson,
  useUploadTutorSubjectLessonsJson,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { LessonsJsonOut, ProcessLessonsJsonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

type AggregateResult = Pick<
  ProcessLessonsJsonOut,
  "topics_created" | "topics_reused" | "lessons_created" | "lessons_skipped"
>;

// Opened from the tutor's Subject detail page. A two-step wizard: step 1
// uploads a scrape_lessons-shaped JSON file, or a .zip archive of several
// (one lessons.models.LessonsJson row gets staged per .json file — see
// tutoring.api.upload_subject_lessons_json), step 2 lets the tutor glance
// at the staged file(s) before importing them all — reuses an existing
// Topic by title, creates any Lesson under it that isn't already there.
// See lessons.services.import_topics_and_lessons.
export function LoadLessonsJsonDialog({ subjectId }: { subjectId: number }) {
  const t = useTranslations("LoadLessonsJson");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<LessonsJsonOut[] | null>(null);
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState(false);

  const uploadLessonsJson = useUploadTutorSubjectLessonsJson();
  const processLessonsJson = useProcessLessonsJson();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setDescription("");
      setFile(null);
      setUploaded(null);
      setResult(null);
      setIsProcessing(false);
      setProcessError(false);
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    uploadLessonsJson.mutate(
      { subjectId, data: { name, description, file } },
      {
        onSuccess: (data) => {
          setUploaded(data);
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsJsonQueryKey(subjectId) });
        },
      },
    );
  };

  const handleAddLessons = async () => {
    if (!uploaded) return;
    setIsProcessing(true);
    setProcessError(false);

    const aggregate: AggregateResult = {
      topics_created: 0,
      topics_reused: 0,
      lessons_created: 0,
      lessons_skipped: 0,
    };
    try {
      for (const item of uploaded) {
        const data = await processLessonsJson.mutateAsync({ lessonsJsonId: item.id });
        aggregate.topics_created += data.topics_created;
        aggregate.topics_reused += data.topics_reused;
        aggregate.lessons_created += data.lessons_created;
        aggregate.lessons_skipped += data.lessons_skipped;
      }
      setResult(aggregate);
      queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
      queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
      queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsJsonQueryKey(subjectId) });
    } catch {
      setProcessError(true);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("triggerButton")}
          aria-label={t("triggerButton")}
          className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
        >
          <Upload className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">📥 {t("title")}</Dialog.Title>
          <p className="mt-1 text-xs text-gray-500">{t("stepOfTotal", { step: uploaded ? 2 : 1 })}</p>

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
          ) : uploaded ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {uploaded.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    {item.description && <p className="whitespace-pre-wrap text-xs">{item.description}</p>}
                    {item.file_url && (
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="self-start text-xs text-blue-600 underline hover:no-underline"
                      >
                        {t("viewFileLink")}
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {processError && <p className="text-sm text-red-600">{t("processError")}</p>}

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
                  type="button"
                  onClick={handleAddLessons}
                  disabled={isProcessing}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isProcessing ? t("processing") : t("addLessonsButton")}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpload} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="lessons-json-name" className="text-xs font-medium text-gray-700">
                  {t("nameLabel")}
                </label>
                <input
                  id="lessons-json-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="lessons-json-description" className="text-xs font-medium text-gray-700">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  id="lessons-json-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="lessons-json-file" className="text-xs font-medium text-gray-700">
                  {t("fileLabel")}
                </label>
                <input
                  id="lessons-json-file"
                  type="file"
                  accept="application/json,.json,.zip,application/zip,application/x-zip-compressed"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-700"
                />
                <p className="text-xs text-gray-500">{t("fileHint")}</p>
              </div>

              {uploadLessonsJson.isError && <p className="text-sm text-red-600">{t("uploadError")}</p>}

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
                  disabled={!file || uploadLessonsJson.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {t("uploadButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
