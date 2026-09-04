"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { AvatarPicker } from "@/components/profile/avatar-picker";

// The preschool profile's "змінити персонажа" button opens this instead of
// showing AvatarPicker inline on the page (see
// components/preschool/profile-view.tsx) — AvatarPicker itself is
// unchanged, just shown in a popup here. Closes itself the moment a
// character is tapped (AvatarPicker's onSelected), not just via ✕/outside
// click.
export function ChangeCharacterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Profile");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-2xl font-extrabold text-gray-900">
              {t("changeCharacterTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("closeButton")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-600 hover:bg-gray-200"
              >
                ✕
              </button>
            </Dialog.Close>
          </div>
          <AvatarPicker onSelected={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
