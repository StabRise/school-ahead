"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { FileUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { getGetTutorClassQueryKey, useUploadTutorSubjectMarkdown } from "@school-ahead/api-client/browser/tutor/tutor";
import type { ImportSubjectMarkdownOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Opened from the tutor's Class detail page. Single-step: pick a single
// subject's curriculum markdown file (front matter — Subject/SubjectBlocks/
// Description/… — then one "## Topic" section per topic, each holding a flat
// sequence of lessons, see scraped.tmp/!plans/*/*/*-plan.md) and it's
// parsed+imported immediately (see academics.services.parse_subject_markdown
// / lessons.services.import_subject_markdown) — get_or_creates the Subject,
// fills its description and SubjectBlocks, and creates every topic/lesson.
export function LoadSubjectMarkdownDialog({ classId }: { classId: number }) {
  const t = useTranslations("LoadSubjectMarkdown");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportSubjectMarkdownOut | null>(null);

  const uploadSubject = useUploadTutorSubjectMarkdown();

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

    uploadSubject.mutate(
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
          <FileUp className="h-4 w-4" />
          {t("triggerButton")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">📚 {t("title")}</Dialog.Title>
          <p className="mt-1 text-xs text-gray-500">{t("description")}</p>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm font-medium text-gray-900">{t("resultHeading", { subjectName: result.subject_name })}</p>
              <div className="flex flex-col gap-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                <Link href={`/tutor/subjects/${result.subject_id}`} className="text-blue-600 hover:underline">
                  {result.subject_created ? t("subjectCreated") : t("subjectReused")}
                </Link>
                <p>{t("blocksCount", { count: result.blocks_count })}</p>

                <div className="flex flex-col gap-1">
                  <p className="font-medium text-gray-900">
                    {t("topicsSummary", { created: result.topics_created, reused: result.topics_reused })}
                  </p>
                  <ul className="list-inside list-disc">
                    {result.topics.map((topic) => (
                      <li key={topic.id}>{topic.title}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="font-medium text-gray-900">
                    {t("lessonsSummary", { created: result.lessons_created, skipped: result.lessons_skipped })}
                  </p>
                  <ul className="max-h-48 list-inside list-disc overflow-y-auto">
                    {result.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link href={`/tutor/lessons/${lesson.id}`} className="text-blue-600 hover:underline">
                          {lesson.title}
                        </Link>
                        {!lesson.is_new && <span className="text-gray-400"> ({t("lessonSkippedLabel")})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
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
                <label htmlFor="subject-markdown-file" className="text-xs font-medium text-gray-700">
                  {t("fileLabel")}
                </label>
                <input
                  id="subject-markdown-file"
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-700"
                />
              </div>

              {uploadSubject.isError && <p className="text-sm text-red-600">{t("uploadError")}</p>}

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
                  disabled={!file || uploadSubject.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {uploadSubject.isPending ? t("uploading") : t("uploadButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
