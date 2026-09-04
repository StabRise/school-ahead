"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

// Shown while a not-yet-purchased item is being "tried on" (see
// AvatarPreview/AvatarWardrobe) — docs/core/avatar.md section 2.2's balance
// check, framed as a kid-friendly confirm step instead of buying instantly
// on click.
export function ConfirmPurchaseDialog({
  open,
  onOpenChange,
  itemName,
  price,
  isPending,
  isPreschool = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  price: number;
  isPending: boolean;
  isPreschool?: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("Profile");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md bg-white shadow-lg ${
            isPreschool ? "rounded-3xl p-8" : "p-6"
          }`}
        >
          <Dialog.Title className={`font-semibold text-gray-900 ${isPreschool ? "text-2xl" : "text-lg"}`}>
            {t("confirmPurchaseTitle")}
          </Dialog.Title>
          <p className={`mt-2 text-gray-600 ${isPreschool ? "text-xl" : "text-sm"}`}>
            {t("confirmPurchaseBody", { item: itemName, price })}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className={`rounded-md border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 ${
                  isPreschool ? "px-6 py-3 text-lg" : "px-4 py-2 text-sm"
                }`}
              >
                {t("confirmPurchaseCancel")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className={`rounded-md bg-gray-900 font-medium text-white disabled:opacity-60 ${
                isPreschool ? "px-6 py-3 text-lg" : "px-4 py-2 text-sm"
              }`}
            >
              {t("confirmPurchaseBuy", { price })}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
