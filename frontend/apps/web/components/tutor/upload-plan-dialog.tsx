"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTutorClassQueryKey, useUploadTutorClassPlan } from "@school-ahead/api-client/browser/tutor/tutor";
import type { ImportPlanOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Opened from the tutor's Class detail page. Single-step: pick a
// curriculum-plan text file ("Subject name" / "N семестр" / body, repeated
// — see scraped.tmp/plans/*.md) and it's parsed+imported immediately (see
// academics.services.import_class_plan) — get_or_creates a Subject per
// section and its SubjectBlocks, filling each matching block's description.
export function UploadPlanDialog({ classId }: { classId: number }) {
  const t = useTranslations("UploadPlan");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportPlanOut | null>(null);

  const uploadPlan = useUploadTutorClassPlan();

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

    uploadPlan.mutate(
      { classId, data: { file } },
      {
        onSuccess: (data) => {
          setResult(data);
          queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(classId) });
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Upload className="h-4 w-4" />
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
              <p className="text-sm font-medium text-gray-900">{t("resultHeading", { semesterName: result.semester_name })}</p>
              <div className="flex flex-col gap-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-gray-900">{t("subjectsFoundHeading", { count: result.subjects_found.length })}</p>
                  {result.subjects_found.length === 0 ? (
                    <p className="text-gray-400">{t("noneLabel")}</p>
                  ) : (
                    <ul className="list-inside list-disc">
                      {result.subjects_found.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-gray-900">{t("subjectsAddedHeading", { count: result.subjects_added.length })}</p>
                  {result.subjects_added.length === 0 ? (
                    <p className="text-gray-400">{t("noneLabel")}</p>
                  ) : (
                    <ul className="list-inside list-disc">
                      {result.subjects_added.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-gray-500">{t("blocksUpdated", { count: result.blocks_updated })}</p>
              </div>
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
                <label htmlFor="plan-file" className="text-xs font-medium text-gray-700">
                  {t("fileLabel")}
                </label>
                <input
                  id="plan-file"
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-700"
                />
              </div>

              {uploadPlan.isError && <p className="text-sm text-red-600">{t("uploadError")}</p>}

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
                  disabled={!file || uploadPlan.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {uploadPlan.isPending ? t("uploading") : t("uploadButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
