"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Upload } from "lucide-react";
import {
  getListTutorReadingSyllablesQueryKey,
  useImportTutorReadingSyllables,
  useListTutorReadingSyllables,
  useSetDefaultReadingSyllable,
  useUpdateTutorReadingSyllable,
} from "@school-ahead/api-client/browser/reading/reading";
import type {
  QuizLanguage,
  SyllableImportResultOut,
  SyllableOut,
  SyllablePatchIn,
} from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { FileDropzone } from "@/components/file-dropzone";
import { CONTENT_LANGUAGES, ContentLanguageSelect } from "@/components/tutor/content-language-select";
import { SimplePageContainer } from "@/components/simple/page-container";
import { useDialogs } from "@/components/dialogs/app-dialogs";
import {
  SortableHeader,
  useSortState,
  type SortDirection,
} from "@/components/simple/sortable-header";

type SortKey = "syllable" | "word" | "language" | "default";
type DefaultFilter = "all" | "default" | "other";

function syllableText(syllable: SyllableOut): string {
  return `${syllable.first_letter}${syllable.second_part}`;
}

function compareSyllables(
  a: SyllableOut,
  b: SyllableOut,
  key: SortKey,
  direction: SortDirection,
): number {
  const sign = direction === "asc" ? 1 : -1;
  const bySyllable = syllableText(a).localeCompare(syllableText(b), "uk");
  if (key === "syllable") return sign * bySyllable;
  if (key === "word") return sign * a.word.localeCompare(b.word, "uk");
  // Ties on language / default fall back to syllable order, so rows keep a
  // stable, readable order within each group.
  const primary =
    key === "language"
      ? a.language.localeCompare(b.language)
      : Number(b.is_default) - Number(a.is_default);
  return primary !== 0 ? sign * primary : bySyllable;
}

// Case-insensitive match on the syllable or its word, then the first
// letter, language and Основна filters.
function filterSyllables(
  syllables: SyllableOut[],
  query: string,
  firstLetter: string,
  language: string,
  defaultFilter: DefaultFilter,
): SyllableOut[] {
  const needle = query.trim().toLocaleLowerCase("uk");
  return syllables.filter((syllable) => {
    if (firstLetter !== "all" && syllable.first_letter !== firstLetter)
      return false;
    if (language !== "all" && syllable.language !== language) return false;
    if (defaultFilter === "default" && !syllable.is_default) return false;
    if (defaultFilter === "other" && syllable.is_default) return false;
    if (!needle) return true;
    return `${syllableText(syllable)} ${syllable.word}`
      .toLocaleLowerCase("uk")
      .includes(needle);
  });
}

function FilterPills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-md border border-gray-300 p-0.5 text-xs font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-2 py-1 ${value === option.value ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// "Імпортувати" — opens a dialog with the cards' language (Ukrainian by
// default) and a drop area for any number of files, each either a picture
// named after its word (`Баран.png` -> one БА card) or a ZIP shaped like the
// legacy public/static/syllables/<consonant>/{words.json,<syllable>.png} or
// public/static/letters/<consonant>/<Word>.png asset folders (see backend's
// reading/services.py::import_syllables_archive / import_syllable_image).
// Files go up one at a time to the same endpoint, and their counts add up
// into one result; a file the backend rejects is listed by name instead of
// stopping the rest. Same Radix dialog look as load-lessons-json-dialog.tsx.
function ImportSyllablesDialog() {
  const t = useTranslations("TutorSyllables");
  const queryClient = useQueryClient();
  const importSyllables = useImportTutorReadingSyllables();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<QuizLanguage>("uk");
  const [files, setFiles] = useState<File[]>([]);
  // How many of `files` have been sent so far, while importing.
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<SyllableImportResultOut | null>(null);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const isImporting = progress !== null;

  const handleOpenChange = (next: boolean) => {
    // Don't drop an import that's still uploading.
    if (!next && isImporting) return;
    setOpen(next);
    if (!next) {
      setLanguage("uk");
      setFiles([]);
      setResult(null);
      setFailedFiles([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;
    const total: SyllableImportResultOut = { created: 0, updated: 0, skipped: 0 };
    const failed: string[] = [];
    setProgress(0);
    for (const [index, file] of files.entries()) {
      try {
        const summary = await importSyllables.mutateAsync({ data: { file, language } });
        total.created += summary.created;
        total.updated += summary.updated;
        total.skipped += summary.skipped;
      } catch {
        failed.push(file.name);
      }
      setProgress(index + 1);
    }
    setProgress(null);
    setFailedFiles(failed);
    // Every file failing is an error on the form; otherwise show the counts
    // (plus which files failed, if any).
    if (failed.length < files.length) setResult(total);
    queryClient.invalidateQueries({
      queryKey: getListTutorReadingSyllablesQueryKey(),
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {t("importButton")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("importDialogTitle")}</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-gray-500">{t("importDialogDescription")}</Dialog.Description>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                {t("importResult", {
                  created: result.created,
                  updated: result.updated,
                  skipped: result.skipped,
                })}
              </p>
              {failedFiles.length > 0 && (
                <p className="text-sm text-red-600">
                  {t("importFailedFiles", { files: failedFiles.join(", ") })}
                </p>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="self-end rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  {t("importCloseButton")}
                </button>
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="syllables-import-language" className="text-xs font-medium text-gray-700">
                  {t("importLanguageLabel")}
                </label>
                <ContentLanguageSelect
                  id="syllables-import-language"
                  value={language}
                  onChange={setLanguage}
                  disabled={isImporting}
                  className="w-fit rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-700">{t("importFileLabel")}</span>
                <FileDropzone
                  id="syllables-import-file"
                  hint={t("importFileHint")}
                  accept=".zip,application/zip,application/x-zip-compressed,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onFilesSelected={(picked) => {
                    if (isImporting) return;
                    setFiles(Array.from(picked ?? []));
                    setFailedFiles([]);
                  }}
                />
                {files.length > 0 && (
                  <ul className="max-h-32 overflow-y-auto text-xs text-gray-500">
                    {files.map((file, index) => (
                      <li key={`${index}:${file.name}`}>{file.name}</li>
                    ))}
                  </ul>
                )}
              </div>

              {!isImporting && failedFiles.length > 0 && (
                <p className="text-sm text-red-600">{t("importError")}</p>
              )}

              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={isImporting}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t("importCancelButton")}
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={files.length === 0 || isImporting}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isImporting
                    ? t("importingProgress", { done: progress, total: files.length })
                    : t("importSubmitButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Saves one row's inline edit (see the cells below) and refetches the
// table — a syllable/language change can move the "Основна" flag between
// rows (see backend reading/api.py's update_syllable).
function useSaveSyllable(syllable: SyllableOut) {
  const t = useTranslations("TutorSyllables");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const update = useUpdateTutorReadingSyllable();

  const save = (data: SyllablePatchIn, onSuccess?: () => void) => {
    // Enter, then the blur that follows it, would otherwise save twice.
    if (update.isPending) return;
    update.mutate(
      { syllableId: syllable.id, data },
      {
        onSuccess: (updated) => {
          // Show the saved row right away, before the refetch lands.
          queryClient.setQueryData<SyllableOut[]>(
            getListTutorReadingSyllablesQueryKey(),
            (rows) => rows?.map((row) => (row.id === updated.id ? updated : row)),
          );
          onSuccess?.();
          queryClient.invalidateQueries({
            queryKey: getListTutorReadingSyllablesQueryKey(),
          });
        },
        onError: () => dialogs.error(t("editError")),
      },
    );
  };
  return { save, isPending: update.isPending };
}

const EDIT_INPUT_CLASS =
  "rounded border border-gray-300 px-1.5 py-0.5 focus:border-gray-500 focus:outline-none disabled:opacity-50";

// Click-to-edit cell for the card's syllable — two inputs, the blue first
// letter and the red second part. Enter or clicking away saves (only when
// something changed), Escape cancels.
function SyllableCell({ syllable }: { syllable: SyllableOut }) {
  const t = useTranslations("TutorSyllables");
  const { save, isPending } = useSaveSyllable(syllable);
  const [editing, setEditing] = useState(false);
  const [firstLetter, setFirstLetter] = useState(syllable.first_letter);
  const [secondPart, setSecondPart] = useState(syllable.second_part);

  const startEditing = () => {
    setFirstLetter(syllable.first_letter);
    setSecondPart(syllable.second_part);
    setEditing(true);
  };
  const commit = () => {
    const first = firstLetter.trim().toLocaleUpperCase();
    const second = secondPart.trim().toLocaleUpperCase();
    // The second part may be empty — a word starting with a vowel (Арбуз -> А).
    if (!first) return setEditing(false);
    if (first === syllable.first_letter && second === syllable.second_part)
      return setEditing(false);
    save({ first_letter: first, second_part: second }, () => setEditing(false));
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        title={t("editHint")}
        className="-mx-1.5 rounded px-1.5 text-base font-extrabold hover:bg-gray-100"
      >
        <span style={{ color: "#0369a1" }}>{syllable.first_letter}</span>
        <span style={{ color: "#dc2626" }}>{syllable.second_part}</span>
      </button>
    );
  }

  return (
    <div
      className="flex gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    >
      <input
        autoFocus
        value={firstLetter}
        onChange={(e) => setFirstLetter(e.target.value)}
        maxLength={4}
        disabled={isPending}
        aria-label={t("editFirstLetter")}
        className={`${EDIT_INPUT_CLASS} w-10 text-base font-extrabold uppercase text-sky-700`}
      />
      <input
        value={secondPart}
        onChange={(e) => setSecondPart(e.target.value)}
        maxLength={4}
        disabled={isPending}
        aria-label={t("editSecondPart")}
        className={`${EDIT_INPUT_CLASS} w-10 text-base font-extrabold uppercase text-red-600`}
      />
    </div>
  );
}

// Click-to-edit cell for the card's word — same Enter / click-away /
// Escape rules as SyllableCell.
function WordCell({ syllable }: { syllable: SyllableOut }) {
  const t = useTranslations("TutorSyllables");
  const { save, isPending } = useSaveSyllable(syllable);
  const [editing, setEditing] = useState(false);
  const [word, setWord] = useState(syllable.word);

  const commit = () => {
    const next = word.trim();
    if (!next || next === syllable.word) return setEditing(false);
    save({ word: next }, () => setEditing(false));
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setWord(syllable.word);
          setEditing(true);
        }}
        title={t("editHint")}
        className="-mx-1.5 rounded px-1.5 text-left text-gray-900 hover:bg-gray-100"
      >
        {syllable.word}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={word}
      onChange={(e) => setWord(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      maxLength={64}
      disabled={isPending}
      aria-label={t("columnWord")}
      className={`${EDIT_INPUT_CLASS} w-40 text-sm`}
    />
  );
}

// The card's language — an always-visible dropdown that saves on change.
function LanguageCell({ syllable }: { syllable: SyllableOut }) {
  const t = useTranslations("TutorSyllables");
  const { save, isPending } = useSaveSyllable(syllable);
  return (
    <ContentLanguageSelect
      value={syllable.language as QuizLanguage}
      onChange={(language) => {
        if (language !== syllable.language) save({ language });
      }}
      disabled={isPending}
      ariaLabel={t("columnLanguage")}
      className="rounded-md border border-transparent bg-transparent py-0.5 pl-1 pr-6 text-sm text-gray-600 hover:border-gray-300 focus:border-gray-500 focus:outline-none disabled:opacity-50"
    />
  );
}

// The "Основна" cell — a badge for the current default card of its
// syllable group, or (for every other card in the group) a button that
// makes it the default instead. The backend clears the old default in the
// same request (see reading/api.py's set_default_syllable), so only this
// row's own optimistic-looking refetch is needed, not a manual patch of
// the previous default's row.
function DefaultCell({ syllable }: { syllable: SyllableOut }) {
  const t = useTranslations("TutorSyllables");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const setDefault = useSetDefaultReadingSyllable();

  if (syllable.is_default) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        {t("defaultBadge")}
      </span>
    );
  }

  const handleClick = () => {
    setDefault.mutate(
      { syllableId: syllable.id },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: getListTutorReadingSyllablesQueryKey(),
          }),
        onError: () => dialogs.error(t("setDefaultError")),
      },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={setDefault.isPending}
      className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      {t("makeDefaultButton")}
    </button>
  );
}

export function TutorSyllablesPage() {
  const t = useTranslations("TutorSyllables");
  const {
    data: syllables,
    isLoading,
    isError,
  } = useListTutorReadingSyllables();
  const [query, setQuery] = useState("");
  const [firstLetter, setFirstLetter] = useState("all");
  const [language, setLanguage] = useState("all");
  const [defaultFilter, setDefaultFilter] = useState<DefaultFilter>("all");
  const { sort, toggleSort } = useSortState<SortKey>("syllable");

  const locale = useLocale();
  const languageName = (code: string) => {
    try {
      const name = new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return code;
    }
  };
  // Only the letters that actually have cards in the picked language (or
  // any language), in alphabet order.
  const firstLetters = useMemo(
    () =>
      Array.from(
        new Set(
          (syllables ?? [])
            .filter((syllable) => language === "all" || syllable.language === language)
            .map((syllable) => syllable.first_letter),
        ),
      ).sort((a, b) => a.localeCompare(b, language === "all" ? "uk" : language)),
    [syllables, language],
  );
  // A letter picked under another language may not exist in this one —
  // fall back to every letter instead of an empty table.
  const handleLanguageChange = (next: string) => {
    setLanguage(next);
    if (
      firstLetter !== "all" &&
      next !== "all" &&
      !(syllables ?? []).some(
        (syllable) => syllable.language === next && syllable.first_letter === firstLetter,
      )
    )
      setFirstLetter("all");
  };
  const visibleSyllables = useMemo(
    () =>
      filterSyllables(
        syllables ?? [],
        query,
        firstLetter,
        language,
        defaultFilter,
      ).sort((a, b) => compareSyllables(a, b, sort.key, sort.direction)),
    [syllables, query, firstLetter, language, defaultFilter, sort],
  );

  const header = (key: SortKey, label: string) => (
    <SortableHeader
      label={label}
      active={sort.key === key}
      direction={sort.direction}
      onClick={() => toggleSort(key)}
    />
  );

  return (
    <SimplePageContainer title={t("title")}>
      <div className="mb-3 flex items-center justify-end gap-2">
        <ImportSyllablesDialog />
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && (syllables?.length ?? 0) === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {syllables && syllables.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-48 flex-1 items-center">
            <Search
              className="pointer-events-none absolute left-2 size-3.5 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="w-full rounded-md border border-gray-300 py-1.5 pl-7 pr-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </label>
          {/* Every language a card can be in (backend QuizLanguage), even
              before any card uses it. It comes first since it narrows the
              letter filter next to it. */}
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600">
            {t("filterLanguage")}
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-white py-1.5 pl-2 pr-7 text-sm text-gray-800 focus:border-gray-500 focus:outline-none"
            >
              <option value="all">{t("filterLanguageAll")}</option>
              {CONTENT_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          </label>
          {/* Its own labelled filter — a dropdown of every first letter that
              has cards in the picked language — same dropdown look as the
              language filter. */}
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600">
            {t("filterFirstLetter")}
            <select
              value={firstLetter}
              onChange={(e) => setFirstLetter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white py-1.5 pl-2 pr-7 text-sm font-bold text-gray-800 focus:border-gray-500 focus:outline-none"
            >
              <option value="all">{t("filterFirstLetterAll")}</option>
              {firstLetters.map((letter) => (
                <option key={letter} value={letter}>
                  {letter}
                </option>
              ))}
            </select>
          </label>
          <FilterPills
            value={defaultFilter}
            options={[
              { value: "all", label: t("filterAll") },
              { value: "default", label: t("defaultBadge") },
              { value: "other", label: t("filterNotDefault") },
            ]}
            onChange={setDefaultFilter}
          />
        </div>
      )}

      {syllables && syllables.length > 0 && visibleSyllables.length === 0 && (
        <p className="px-2 py-3 text-sm text-gray-500">{t("noMatches")}</p>
      )}

      {visibleSyllables.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2">{t("columnIcon")}</th>
                <th className="px-4 py-2">
                  {header("syllable", t("columnSyllable"))}
                </th>
                <th className="px-4 py-2">{header("word", t("columnWord"))}</th>
                <th className="px-4 py-2">
                  {header("language", t("columnLanguage"))}
                </th>
                <th className="px-4 py-2">
                  {header("default", t("columnDefault"))}
                </th>
                <th className="px-4 py-2">{t("columnSyllableAudio")}</th>
                <th className="px-4 py-2">{t("columnWordAudio")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleSyllables.map((syllable) => (
                <tr key={syllable.id}>
                  <td className="px-4 py-2">
                    {syllable.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={syllable.icon}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <span className="block h-10 w-10 rounded-md bg-gray-100" />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <SyllableCell syllable={syllable} />
                  </td>
                  <td className="px-4 py-2">
                    <WordCell syllable={syllable} />
                  </td>
                  <td className="px-4 py-2">
                    <LanguageCell syllable={syllable} />
                  </td>
                  <td className="px-4 py-2">
                    <DefaultCell syllable={syllable} />
                  </td>
                  <td className="px-4 py-2">
                    {syllable.syllable_audio ? (
                      <audio
                        controls
                        src={syllable.syllable_audio}
                        className="h-8 w-36"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {syllable.word_audio ? (
                      <audio
                        controls
                        src={syllable.word_audio}
                        className="h-8 w-36"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SimplePageContainer>
  );
}
