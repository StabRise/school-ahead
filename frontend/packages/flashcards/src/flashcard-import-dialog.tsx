"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@school-ahead/api-client";
import { useGetMySubjects } from "@school-ahead/api-client/browser/academics/academics";
import {
  getListMyCardGroupsQueryKey,
  getListMyCardSetsQueryKey,
  useImportStudentCardSet,
} from "@school-ahead/api-client/browser/cards/cards";
import { ImportStudentCardSetBody } from "@school-ahead/api-client/zod/cards/cards";
import type { ImportCardSetOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { LocaleLink as Link } from "./kit/locale-link";

// A student picks the exact same file public/static/cards/<group>/<set>/
// set.json already uses ({"set": {"title": ..., "categories": [...]}})
// rather than a reshaped-for-this-endpoint format — unwrap that "set"
// envelope if present, otherwise assume the file is already the bare
// {title, categories} shape import_card_set expects. `subjectId` (the
// picker/fixed field below) is merged in before validation, since set.json
// itself never names its own subject.
function unwrapSetJson(parsed: unknown, subjectId: number): unknown {
  const body = parsed !== null && typeof parsed === "object" && "set" in parsed ? (parsed as { set: unknown }).set : parsed;
  return body !== null && typeof body === "object" ? { ...body, subject_id: subjectId } : body;
}

// "Load set from json file" (docs/preschool/games/cards.md) — lets a
// student import a whole set.json-shaped deck as personal flashcards
// under a real Subject (set.json itself carries no subject — only a topic
// title and its categories). `fixedSubject` — passed from that Subject's
// own Картки tab — pins the subject and shows it read-only, since it's
// already known and shouldn't be second-guessed; omitted (the standalone
// /games/cards group picker's case), the student instead picks one of
// their real subjects from a dropdown. Either way `subject_id` is always a
// real Subject id, so the cards are guaranteed to land on that Subject's
// own group (cards/api.py's subject-<id>) — matched there against a real
// Topic/Lesson (cards.services.import_card_set) when possible, or filed
// under a personal `custom-<id>` set within that same group otherwise;
// never a separate subject-less bucket. Only ever rendered for students —
// importing creates StudentCard rows scoped to the caller's own
// StudentProfile, so a tutor/parent viewing the same page shouldn't see
// it.
export function FlashcardImportDialog({ fixedSubject }: { fixedSubject?: { id: number; name: string } }) {
  const t = useTranslations("FlashcardsGame");
  const queryClient = useQueryClient();
  const isStudent = useAuthStore((state) => state.user?.role === "student");
  const [open, setOpen] = useState(false);
  const [pickedSubjectId, setPickedSubjectId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCardSetOut | null>(null);
  const importSet = useImportStudentCardSet();
  const subjectsQuery = useGetMySubjects({ query: { enabled: isStudent && !fixedSubject && open } });
  const subjects = subjectsQuery.data ?? [];

  // Defaults the picker (fixedSubject-less case only) to the first loaded
  // subject so the <select> doesn't sit on a blank option, without a
  // separate effect just to sync state to a query result — computed
  // straight from render inputs instead (see https://react.dev/learn/
  // you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const subjectId = fixedSubject?.id ?? pickedSubjectId ?? subjects[0]?.id ?? null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPickedSubjectId(null);
      setError(null);
      setResult(null);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);

    if (subjectId === null) {
      setError(t("importSubjectRequired"));
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError(t("importFileReadError"));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError(t("importInvalidJson"));
      return;
    }

    const candidate = ImportStudentCardSetBody.safeParse(unwrapSetJson(parsed, subjectId));
    if (!candidate.success) {
      setError(t("importInvalidShape"));
      return;
    }

    try {
      const data = await importSet.mutateAsync({ data: candidate.data });
      setResult(data);
      queryClient.invalidateQueries({ queryKey: getListMyCardGroupsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListMyCardSetsQueryKey(data.group_slug) });
    } catch {
      setError(t("importServerError"));
    }
  };

  if (!isStudent) return null;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("importTriggerButton")}
          aria-label={t("importTriggerButton")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Upload className="size-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900">
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {t("importDialogTitle")}
          </Dialog.Title>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("importDialogHint")}</p>

          {result ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {t("importSuccess", {
                  count: result.imported_count,
                  group: result.group_title,
                  set: result.set_title,
                })}
              </p>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {t("importCloseButton")}
                  </button>
                </Dialog.Close>
                <Link
                  href={`/games/cards/${encodeURIComponent(result.group_slug)}/${encodeURIComponent(result.set_slug)}`}
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {t("importOpenSetButton")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="flashcard-import-subject" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("importSubjectLabel")}
                </label>
                {fixedSubject ? (
                  <input
                    id="flashcard-import-subject"
                    type="text"
                    value={fixedSubject.name}
                    disabled
                    readOnly
                    className="cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  />
                ) : (
                  <select
                    id="flashcard-import-subject"
                    required
                    value={subjectId ?? ""}
                    onChange={(e) => setPickedSubjectId(Number(e.target.value))}
                    disabled={subjectsQuery.isLoading || subjects.length === 0}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {subjects.map((subjectOption) => (
                      <option key={subjectOption.id} value={subjectOption.id}>
                        {subjectOption.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleFile(file);
                }}
                className="text-sm text-slate-700 dark:text-slate-200"
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {importSet.isPending && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("importInProgress")}</p>
              )}
              <div className="flex justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {t("importCloseButton")}
                  </button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
