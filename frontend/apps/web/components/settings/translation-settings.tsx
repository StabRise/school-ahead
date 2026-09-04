"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useUpdateTranslationSettings } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore, type TranslationScope } from "@school-ahead/api-client";

const SCOPES: TranslationScope[] = ["off", "word", "sentence"];

const SCOPE_LABEL_KEY: Record<TranslationScope, string> = {
  off: "translationScopeOff",
  word: "translationScopeWord",
  sentence: "translationScopeSentence",
};

// Settings for the read-along "Перекласти" feature (see
// components/read-along-content.tsx) — persisted on StudentProfile so they
// follow the student across sessions/devices, same pattern as
// preschool-mode-toggle.tsx's interface_mode switch.
export function TranslationSettings() {
  const t = useTranslations("Settings");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateSettings = useUpdateTranslationSettings();

  if (!user || user.role !== "student") return null;

  const scope = user.translationScope ?? "word";
  const translateOnSelect = user.translateOnSelect ?? false;

  const save = (next: { translation_scope: TranslationScope; translate_on_select: boolean }) => {
    updateSettings.mutate(
      { data: next },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700">{t("translationSettingsTitle")}</h3>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-gray-700">{t("translationScopeLabel")}</span>
        <div className="inline-flex w-fit rounded-md border border-gray-300 p-0.5 text-sm">
          {SCOPES.map((option) => (
            <button
              key={option}
              type="button"
              disabled={updateSettings.isPending}
              onClick={() => save({ translation_scope: option, translate_on_select: translateOnSelect })}
              className={`rounded px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                scope === option ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t(SCOPE_LABEL_KEY[option])}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm ${scope === "off" ? "text-gray-400" : "text-gray-700"}`}>
          {t("translateOnSelectLabel")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={translateOnSelect}
          aria-label={t("translateOnSelectLabel")}
          disabled={updateSettings.isPending || scope === "off"}
          onClick={() => save({ translation_scope: scope, translate_on_select: !translateOnSelect })}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${
            translateOnSelect ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              translateOnSelect ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
