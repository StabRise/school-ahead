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
            isPreschool ? "rounded-3xl p-8 text-center" : "p-6"
          }`}
        >
          {isPreschool ? (
            <>
              <Dialog.Title className="text-2xl font-extrabold text-gray-900">{itemName}</Dialog.Title>
              {/* One big number, not a sentence — see the price/lock badge
                  fix in avatar-wardrobe.tsx for the same "numbers need to
                  be huge for a 5-year-old" reasoning. */}
              <p className="mt-3 flex items-center justify-center gap-2 text-6xl font-extrabold text-amber-600">
                💎{price}
              </p>
              <p className="mt-3 text-xl text-gray-600">{t("confirmPurchaseQuestion")}</p>
              <div className="mt-6 flex justify-center gap-3">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-full border-2 border-gray-300 px-6 py-3 text-lg font-bold text-gray-700 hover:bg-gray-50"
                  >
                    {t("confirmPurchaseCancel")}
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isPending}
                  className="preschool-button rounded-full bg-emerald-500 px-6 py-3 text-lg font-extrabold text-white ring-4 ring-emerald-300 disabled:opacity-60"
                >
                  {t("confirmPurchaseBuyShort")}
                </button>
              </div>
            </>
          ) : (
            <>
              <Dialog.Title className="text-lg font-semibold text-gray-900">
                {t("confirmPurchaseTitle")}
              </Dialog.Title>
              <p className="mt-2 text-sm text-gray-600">{t("confirmPurchaseBody", { item: itemName, price })}</p>
              <div className="mt-4 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("confirmPurchaseCancel")}
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {t("confirmPurchaseBuy", { price })}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
