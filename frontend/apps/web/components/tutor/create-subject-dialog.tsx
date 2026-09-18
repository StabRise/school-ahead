"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useListSubjectGroups } from "@school-ahead/api-client/browser/academics/academics";
import { getGetTutorClassQueryKey, useCreateTutorClassSubject } from "@school-ahead/api-client/browser/tutor/tutor";
import { useRouter } from "@/i18n/navigation";
import { DateRangeFields } from "./schedule-period-fields";

// September 1 .. May 31 of `academicYear` (e.g. "2025/2026" -> ["2025-09-01",
// "2026-05-31"]) — the same school-year convention Subject.save() falls
// back to server-side (academics.models.default_subject_start_date/
// default_subject_due_date) when neither date is given, just made explicit
// and editable here since a tutor creating a bare subject from scratch (no
// plan/Markdown file to infer it from) has no other content to default from.
function defaultSchoolYearRange(academicYear: string): { startDate: string; endDate: string } {
  const [startYear, endYear] = academicYear.split("/");
  return { startDate: `${startYear}-09-01`, endDate: `${endYear ?? startYear}-05-31` };
}

// Opened from the tutor's Class detail page — creates a bare Subject (just
// a name, a date range and optionally a category/SubjectGroup) with no
// topics/lessons yet, for a tutor building
// a curriculum from scratch rather than importing one (see
// UploadPlanDialog/LoadSubjectMarkdownDialog for those). Navigates straight
// to the new subject's own detail page afterward, same "create then jump
// into the editor" convention as the tutor's "Add story" action.
export function CreateSubjectDialog({ classId, academicYear }: { classId: number; academicYear: string }) {
  const t = useTranslations("CreateSubject");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const defaultRange = defaultSchoolYearRange(academicYear);
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  // "" = no category (Subject.group stays null).
  const [groupId, setGroupId] = useState("");
  const { data: subjectGroups } = useListSubjectGroups();
  const groups = subjectGroups ?? [];

  const createSubject = useCreateTutorClassSubject();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setStartDate(defaultRange.startDate);
      setEndDate(defaultRange.endDate);
      setGroupId("");
    }
  };

  const isDateRangeValid = startDate <= endDate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !isDateRangeValid) return;

    createSubject.mutate(
      { classId, data: { name, start_date: startDate, due_date: endDate, group_id: groupId === "" ? null : Number(groupId) } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(classId) });
          router.push(`/tutor/subjects/${created.subject_id}`);
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("triggerButton")}
          aria-label={t("triggerButton")}
          className="flex shrink-0 items-center justify-center rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">➕ {t("title")}</Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-subject-name" className="text-xs font-medium text-gray-700">
                {t("nameLabel")}
              </label>
              <input
                id="new-subject-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              />
            </div>

            {groups.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="new-subject-group" className="text-xs font-medium text-gray-700">
                  {t("groupLabel")}
                </label>
                <select
                  id="new-subject-group"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                >
                  <option value="">{t("noGroupOption")}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DateRangeFields
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />

            {createSubject.isError && <p className="text-sm text-red-600">{t("createError")}</p>}

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
                disabled={!name.trim() || !isDateRangeValid || createSubject.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {createSubject.isPending ? t("creating") : t("createButton")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
