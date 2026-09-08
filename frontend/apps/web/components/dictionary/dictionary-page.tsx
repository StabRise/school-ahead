"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "@/components/page-container";
import { LANGUAGE_OPTIONS } from "@/components/read-along-control-panel";
import {
  getListDictionaryItemsQueryKey,
  useDeleteDictionaryItem,
  useListDictionaryItems,
  useUpdateDictionaryItemStatus,
  useUpdateDictionaryItemTranslation,
} from "@school-ahead/api-client/browser/dictionary/dictionary";
import type { DictionaryItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import type { SpeechLanguage } from "@school-ahead/api-client";

const STATUSES = ["new", "in_progress", "known"] as const;
type DictionaryStatus = (typeof STATUSES)[number];

const STATUS_LABEL_KEY: Record<DictionaryStatus, string> = {
  new: "statusNew",
  in_progress: "statusInProgress",
  known: "statusKnown",
};

// Order "knowing level" sort/filter progresses through — matches STATUSES,
// kept as its own map so a future status reordering can't silently change
// sort order without updating this too.
const STATUS_RANK: Record<DictionaryStatus, number> = { new: 0, in_progress: 1, known: 2 };

const SORTS = ["recent", "abc", "level"] as const;
type DictionarySort = (typeof SORTS)[number];

const SORT_LABEL_KEY: Record<DictionarySort, string> = {
  recent: "sortRecent",
  abc: "sortAbc",
  level: "sortLevel",
};

const CREATED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

function langLabel(t: (key: string) => string, lang: string) {
  const option = LANGUAGE_OPTIONS.find((o) => o.value === lang);
  return option ? t(option.labelKey) : lang;
}

// Flag emoji shown next to a dictionary item's text — a quicker visual cue
// than a text pill for the item's source language. Matches LANGUAGE_OPTIONS'
// three supported languages; falls back to the raw code for anything else.
const LANG_FLAG: Record<string, string> = { en: "🇬🇧", uk: "🇺🇦", pl: "🇵🇱" };

function langFlag(lang: string): string {
  return LANG_FLAG[lang] ?? lang;
}

function DictionaryItemRow({ item, onChanged }: { item: DictionaryItemOut; onChanged: () => void }) {
  const t = useTranslations("Dictionary");
  const tReadAlong = useTranslations("ReadAlong");
  const updateStatus = useUpdateDictionaryItemStatus();
  const updateTranslation = useUpdateDictionaryItemTranslation();
  const deleteItem = useDeleteDictionaryItem();
  const [editing, setEditing] = useState(false);
  const [draftTranslation, setDraftTranslation] = useState(item.translation);

  const handleStatusChange = (status: DictionaryStatus) => {
    if (status === item.status || updateStatus.isPending) return;
    updateStatus.mutate({ itemId: item.id, data: { status } }, { onSuccess: onChanged });
  };

  const handleDelete = () => {
    deleteItem.mutate({ itemId: item.id }, { onSuccess: onChanged });
  };

  const startEditing = () => {
    setDraftTranslation(item.translation);
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const saveTranslation = () => {
    const translation = draftTranslation.trim();
    if (!translation || updateTranslation.isPending) return;
    updateTranslation.mutate(
      { itemId: item.id, data: { translation } },
      {
        onSuccess: () => {
          setEditing(false);
          onChanged();
        },
      },
    );
  };

  return (
    <li className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-gray-900">{item.text}</p>
            <span
              role="img"
              aria-label={langLabel(tReadAlong, item.lang)}
              title={langLabel(tReadAlong, item.lang)}
              className="shrink-0 text-base leading-none"
            >
              {langFlag(item.lang)}
            </span>
          </div>

          {editing ? (
            <div className="mt-1 flex items-center gap-1">
              <input
                type="text"
                value={draftTranslation}
                onChange={(e) => setDraftTranslation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTranslation();
                  if (e.key === "Escape") cancelEditing();
                }}
                autoFocus
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-500"
              />
              <button
                type="button"
                onClick={saveTranslation}
                disabled={updateTranslation.isPending || !draftTranslation.trim()}
                aria-label={t("saveButton")}
                title={t("saveButton")}
                className="rounded-md p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                aria-label={t("cancelButton")}
                title={t("cancelButton")}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="text-sm text-gray-600">{item.translation}</p>
              <button
                type="button"
                onClick={startEditing}
                aria-label={t("editButton")}
                title={t("editButton")}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteItem.isPending}
          aria-label={t("deleteButton")}
          className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="rounded-md bg-gray-50 p-2 text-sm">
        <p className="text-gray-700">{item.sample}</p>
        <p className="mt-1 text-gray-500">{item.sample_translation}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex w-fit rounded-md border border-gray-300 p-0.5 text-xs">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              disabled={updateStatus.isPending}
              onClick={() => handleStatusChange(status)}
              className={`rounded px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                item.status === status ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t(STATUS_LABEL_KEY[status])}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{CREATED_AT_FORMAT.format(new Date(item.created_at))}</span>
      </div>
    </li>
  );
}

// Student's personal word/phrase dictionary — reachable from the header's
// main menu. Items are saved from the read-along "Перекласти" popup (see
// components/read-along-content.tsx's "Додати до словника" button) rather
// than added here; this page is for reviewing, editing, filtering/sorting,
// tracking learning progress (status), and pruning them.
export function DictionaryPage() {
  const t = useTranslations("Dictionary");
  const tReadAlong = useTranslations("ReadAlong");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DictionaryStatus | "all">("all");
  const [langFilter, setLangFilter] = useState<SpeechLanguage | "all">("all");
  const [sort, setSort] = useState<DictionarySort>("recent");
  const { data, isLoading, isError } = useListDictionaryItems();

  const languagesInUse = useMemo(
    () => LANGUAGE_OPTIONS.filter((option) => (data ?? []).some((item) => item.lang === option.value)),
    [data],
  );

  const items = useMemo(() => {
    const filtered = (data ?? []).filter(
      (item) => (filter === "all" || item.status === filter) && (langFilter === "all" || item.lang === langFilter),
    );
    if (sort === "abc") {
      return [...filtered].sort((a, b) => a.text.localeCompare(b.text));
    }
    if (sort === "level") {
      return [...filtered].sort((a, b) => STATUS_RANK[a.status as DictionaryStatus] - STATUS_RANK[b.status as DictionaryStatus]);
    }
    return filtered;
  }, [data, filter, langFilter, sort]);

  const handleChanged = () => {
    queryClient.invalidateQueries({ queryKey: getListDictionaryItemsQueryKey() });
  };

  return (
    <PageContainer title={t("pageTitle")}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex w-fit rounded-md border border-gray-300 p-0.5 text-sm">
          {(["all", ...STATUSES] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded px-3 py-1 font-medium ${
                filter === status ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {status === "all" ? t("filterAll") : t(STATUS_LABEL_KEY[status])}
            </button>
          ))}
        </div>

        {languagesInUse.length > 1 && (
          <select
            aria-label={t("langFilterLabel")}
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value as SpeechLanguage | "all")}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 outline-none"
          >
            <option value="all">{t("langFilterAll")}</option>
            {languagesInUse.map((option) => (
              <option key={option.value} value={option.value}>
                {langFlag(option.value)} {tReadAlong(option.labelKey)}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label={t("sortLabel")}
          value={sort}
          onChange={(e) => setSort(e.target.value as DictionarySort)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 outline-none"
        >
          {SORTS.map((option) => (
            <option key={option} value={option}>
              {t(SORT_LABEL_KEY[option])}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && items.length === 0 && <p className="text-sm text-gray-500">{t("emptyState")}</p>}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <DictionaryItemRow key={item.id} item={item} onChanged={handleChanged} />
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
