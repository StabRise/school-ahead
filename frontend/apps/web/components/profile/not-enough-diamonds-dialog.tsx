"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

// The "friendly modal prompting the user to complete more lessons to earn
// Diamonds" from docs/core/avatar.md section 2.2 — shown when a purchase
// attempt's balance check fails (backend returns 402).
export function NotEnoughDiamondsDialog({
  open,
  onOpenChange,
  itemName,
  price,
  balance,
  isPreschool = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  price: number;
  balance: number;
  isPreschool?: boolean;
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
            {t("notEnoughDiamondsTitle")}
          </Dialog.Title>
          <p className={`mt-2 text-gray-600 ${isPreschool ? "text-xl" : "text-sm"}`}>
            {t("notEnoughDiamondsBody", { item: itemName, price, balance })}
          </p>
          <div className="mt-4 flex justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                className={`rounded-md bg-gray-900 font-medium text-white ${
                  isPreschool ? "px-6 py-3 text-lg" : "px-4 py-2 text-sm"
                }`}
              >
                {t("notEnoughDiamondsClose")}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
