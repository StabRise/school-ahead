"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "@/i18n/navigation";
import { PreschoolCelebration } from "@/components/preschool/game-choice";

// Standalone entry point to the preschool minigames (Header's "Games" nav
// item), reusing the same picker/player as the post-lessons celebration
// screen (components/student-dashboard.tsx) but reachable at any time
// instead of only once today's lessons are done. Preschool-only — a
// non-preschool student or a tutor bookmarking /games gets bounced home.
export function PreschoolGamesPage() {
  const t = useTranslations("GamesPage");
  const role = useAuthStore((state) => state.user?.role);
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");
  const router = useRouter();

  useEffect(() => {
    if (role && (role !== "student" || !isPreschool)) {
      router.replace("/");
    }
  }, [role, isPreschool, router]);

  if (role && (role !== "student" || !isPreschool)) {
    return null;
  }

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <PreschoolCelebration title={t("title")} subtitle={t("subtitle")} />
    </div>
  );
}
