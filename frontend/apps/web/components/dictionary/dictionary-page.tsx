"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "@/components/page-container";
import {
  getListDictionaryItemsQueryKey,
  useDeleteDictionaryItem,
  useListDictionaryItems,
  useUpdateDictionaryItemStatus,
} from "@school-ahead/api-client/browser/dictionary/dictionary";
import type { DictionaryItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

const STATUSES = ["new", "in_progress", "known"] as const;
type DictionaryStatus = (typeof STATUSES)[number];

const STATUS_LABEL_KEY: Record<DictionaryStatus, string> = {
  new: "statusNew",
  in_progress: "statusInProgress",
  known: "statusKnown",
};

const CREATED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

function DictionaryItemRow({ item, onChanged }: { item: DictionaryItemOut; onChanged: () => void }) {
  const t = useTranslations("Dictionary");
  const updateStatus = useUpdateDictionaryItemStatus();
  const deleteItem = useDeleteDictionaryItem();

  const handleStatusChange = (status: DictionaryStatus) => {
    if (status === item.status || updateStatus.isPending) return;
    updateStatus.mutate({ itemId: item.id, data: { status } }, { onSuccess: onChanged });
  };

  const handleDelete = () => {
    deleteItem.mutate({ itemId: item.id }, { onSuccess: onChanged });
  };

  return (
    <li className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-gray-900">{item.text}</p>
          <p className="text-sm text-gray-600">{item.translation}</p>
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
// than added here; this page is for reviewing, tracking learning progress
// (status), and pruning them.
export function DictionaryPage() {
  const t = useTranslations("Dictionary");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DictionaryStatus | "all">("all");
  const { data, isLoading, isError } = useListDictionaryItems();

  const items = (data ?? []).filter((item) => filter === "all" || item.status === filter);

  const handleChanged = () => {
    queryClient.invalidateQueries({ queryKey: getListDictionaryItemsQueryKey() });
  };

  return (
    <PageContainer title={t("pageTitle")}>
      <div className="mb-4 inline-flex w-fit rounded-md border border-gray-300 p-0.5 text-sm">
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
