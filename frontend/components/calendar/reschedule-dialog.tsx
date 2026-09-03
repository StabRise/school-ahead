"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Popup opened by a lesson row's "change date" button — lets the tutor pick
// any date (not just a drag-and-drop target within the visible week).
// Shared by components/calendar/simple-calendar.tsx's tutor-management mode
// (both the student's own Default/Simple calendar and the tutor's view of a
// student's calendar are the same component now).
export function RescheduleDialog({
  item,
  onOpenChange,
  onSubmit,
  isPending,
  isError,
}: {
  item: CalendarItemOut;
  onOpenChange: (open: boolean) => void;
  onSubmit: (date: string) => void;
  isPending: boolean;
  isError: boolean;
}) {
  const t = useTranslations("Calendar");
  const [date, setDate] = useState(item.scheduled_date);

  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("rescheduleTitle")}</Dialog.Title>
          <p className="mt-1 truncate text-sm text-gray-500">{item.lesson_title}</p>

          <div className="mt-4 flex flex-col gap-1">
            <label htmlFor="reschedule-date" className="text-xs font-medium text-gray-700">
              {t("rescheduleDateLabel")}
            </label>
            <input
              id="reschedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            />
          </div>

          {isError && <p className="mt-2 text-sm text-red-600">{t("rescheduleError")}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("rescheduleCancel")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={!date || isPending}
              onClick={() => onSubmit(date)}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("rescheduleSubmit")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
