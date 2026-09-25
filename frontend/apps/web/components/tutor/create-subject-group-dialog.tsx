"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { SubjectGroupOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { getListSubjectGroupsQueryKey } from "@school-ahead/api-client/browser/academics/academics";
import { useCreateTutorSubjectGroup } from "@school-ahead/api-client/browser/tutor/tutor";

// The "+" after the category tabs on the tutor's Class detail page — adds a
// SubjectGroup at the end of the global order. A group is global (every
// class and the students' bookshelf filter show it), so any tutor can add
// one, same as reordering them.
export function CreateSubjectGroupDialog({ onCreated }: { onCreated: (group: SubjectGroupOut) => void }) {
  const t = useTranslations("CreateSubjectGroup");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const createGroup = useCreateTutorSubjectGroup();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      createGroup.reset();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createGroup.mutate(
      { data: { name } },
      {
        onSuccess: async (created) => {
          await queryClient.invalidateQueries({ queryKey: getListSubjectGroupsQueryKey() });
          handleOpenChange(false);
          onCreated(created);
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
          className="mb-1 flex shrink-0 items-center justify-center self-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">➕ {t("title")}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-gray-500">{t("hint")}</Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-subject-group-name" className="text-xs font-medium text-gray-700">
                {t("nameLabel")}
              </label>
              <input
                id="new-subject-group-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              />
            </div>

            {createGroup.isError && <p className="text-sm text-red-600">{t("createError")}</p>}

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
                disabled={!name.trim() || createGroup.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {createGroup.isPending ? t("creating") : t("createButton")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
