"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useUpdateInterfaceMode } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { useAuthStore, type InterfaceMode } from "@/stores/auth-store";

const MODES: InterfaceMode[] = ["default", "simple", "preschool"];

const MODE_LABEL_KEY: Record<InterfaceMode, string> = {
  default: "viewDefault",
  simple: "viewSimple",
  preschool: "viewPreschool",
};

// Which of the three student dashboard experiences is active — see
// components/student-dashboard.tsx (Standard/Simple) and
// components/preschool/game-map.tsx (Preschool). Persisted on
// StudentProfile via the same interface_mode field/endpoint the header's
// binary preschool-mode-toggle.tsx already uses; this is just the one place
// "simple" can actually be picked, since a toggle switch can't represent a
// third value.
export function ViewSettings() {
  const t = useTranslations("Settings");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateInterfaceMode = useUpdateInterfaceMode();

  if (!user || user.role !== "student") return null;

  const mode = user.interfaceMode ?? "default";

  const handleSelect = (next: InterfaceMode) => {
    if (next === mode || updateInterfaceMode.isPending) return;
    updateInterfaceMode.mutate(
      { data: { interface_mode: next } },
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
      <h3 className="text-sm font-semibold text-gray-700">{t("viewSectionTitle")}</h3>

      <div className="inline-flex w-fit rounded-md border border-gray-300 p-0.5 text-sm">
        {MODES.map((option) => (
          <button
            key={option}
            type="button"
            disabled={updateInterfaceMode.isPending}
            onClick={() => handleSelect(option)}
            className={`rounded px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === option ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t(MODE_LABEL_KEY[option])}
          </button>
        ))}
      </div>
    </div>
  );
}
