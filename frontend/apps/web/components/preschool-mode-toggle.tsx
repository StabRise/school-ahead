"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useUpdateInterfaceMode } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore } from "@school-ahead/api-client";

// Settings switch for docs/interfaces/preschool.md section 1 — persisted on
// StudentProfile so it follows the student across sessions/devices, not a
// local-only zustand toggle.
export function PreschoolModeToggle() {
  const t = useTranslations("Header");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateInterfaceMode = useUpdateInterfaceMode();

  if (!user || user.role !== "student") return null;

  const isPreschool = user.interfaceMode === "preschool";

  const handleToggle = () => {
    const interface_mode = isPreschool ? "default" : "preschool";
    updateInterfaceMode.mutate(
      { data: { interface_mode } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-sm text-gray-700">{t("preschoolMode")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={isPreschool}
        aria-label={t("preschoolMode")}
        disabled={updateInterfaceMode.isPending}
        onClick={handleToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${
          isPreschool ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            isPreschool ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}
