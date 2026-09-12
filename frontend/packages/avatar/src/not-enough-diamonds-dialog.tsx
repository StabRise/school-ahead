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
            isPreschool ? "rounded-3xl p-8 text-center" : "p-6"
          }`}
        >
          {isPreschool ? (
            <>
              <Dialog.Title className="text-2xl font-extrabold text-gray-900">
                {t("notEnoughDiamondsTitleShort")}
              </Dialog.Title>
              {/* Two big numbers side by side (need vs. have) instead of a
                  sentence weaving them together — same "numbers need to be
                  huge" reasoning as the wardrobe's price badge fix. */}
              <div className="mt-4 flex items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold uppercase text-gray-400">{t("priceLabel")}</span>
                  <span className="text-5xl font-extrabold text-amber-600">💎{price}</span>
                </div>
                <span className="text-3xl text-gray-300">/</span>
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold uppercase text-gray-400">{t("balanceLabel")}</span>
                  <span className="text-5xl font-extrabold text-gray-500">💎{balance}</span>
                </div>
              </div>
              <div className="mt-6 flex justify-center">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="preschool-button rounded-full bg-emerald-500 px-6 py-3 text-lg font-extrabold text-white ring-4 ring-emerald-300"
                  >
                    {t("notEnoughDiamondsClose")}
                  </button>
                </Dialog.Close>
              </div>
            </>
          ) : (
            <>
              <Dialog.Title className="text-lg font-semibold text-gray-900">
                {t("notEnoughDiamondsTitle")}
              </Dialog.Title>
              <p className="mt-2 text-sm text-gray-600">
                {t("notEnoughDiamondsBody", { item: itemName, price, balance })}
              </p>
              <div className="mt-4 flex justify-end">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                    {t("notEnoughDiamondsClose")}
                  </button>
                </Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
