"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Upload } from "lucide-react";
import {
  getListTutorReadingSyllablesQueryKey,
  useImportTutorReadingSyllables,
  useListTutorReadingSyllables,
  useSetDefaultReadingSyllable,
} from "@school-ahead/api-client/browser/reading/reading";
import type { QuizLanguage, SyllableOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { ContentLanguageSelect } from "@/components/tutor/content-language-select";
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

// Uploads a ZIP shaped like the legacy public/static/syllables/<consonant>/
// {words.json,<syllable>.png} asset folder (see backend's reading/
// services.py::import_syllables_archive) — the tutor "Syllables" table's
// bulk-loading button. Same "hidden <input type=file>, click to trigger"
// pattern as tutor-stories-page.tsx's ImportStoryButton. The language
// picker beside it sets every imported card's language (Ukrainian by
// default).
function ImportSyllablesButton() {
  const t = useTranslations("TutorSyllables");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const importSyllables = useImportTutorReadingSyllables();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<QuizLanguage>("uk");

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the exact same file later
    if (!file) return;
    importSyllables.mutate(
      { data: { file, language } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({
            queryKey: getListTutorReadingSyllablesQueryKey(),
          });
          void dialogs.alert(
            t("importResult", {
              created: result.created,
              updated: result.updated,
              skipped: result.skipped,
            }),
          );
        },
        onError: () => dialogs.error(t("importError")),
      },
    );
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleFileSelected}
      />
      <ContentLanguageSelect
        value={language}
        onChange={setLanguage}
        ariaLabel={t("importLanguageLabel")}
        disabled={importSyllables.isPending}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importSyllables.isPending}
        className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {importSyllables.isPending ? t("importingStatus") : t("importButton")}
      </button>
    </>
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

  const languages = useMemo(
    () =>
      Array.from(
        new Set((syllables ?? []).map((syllable) => syllable.language)),
      ).sort(),
    [syllables],
  );
  // Only the letters that actually have cards, in alphabet order.
  const firstLetters = useMemo(
    () =>
      Array.from(
        new Set((syllables ?? []).map((syllable) => syllable.first_letter)),
      ).sort((a, b) => a.localeCompare(b, "uk")),
    [syllables],
  );
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
        <ImportSyllablesButton />
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
          {/* Its own labelled filter — a dropdown of every first letter that
              has cards. */}
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
          {/* Only worth a filter once there's more than one language. */}
          {languages.length > 1 && (
            <FilterPills
              value={language}
              options={[
                { value: "all", label: t("filterAll") },
                ...languages.map((code) => ({ value: code, label: code })),
              ]}
              onChange={setLanguage}
            />
          )}
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
                  <td className="px-4 py-2 text-base font-extrabold">
                    <span style={{ color: "#0369a1" }}>
                      {syllable.first_letter}
                    </span>
                    <span style={{ color: "#dc2626" }}>
                      {syllable.second_part}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-900">{syllable.word}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {syllable.language}
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
