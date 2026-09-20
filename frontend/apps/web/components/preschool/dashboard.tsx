"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@school-ahead/api-client";
import { AvatarBadge, useEquippedAvatarLayers } from "@school-ahead/avatar";
import { Cloud, PreschoolButton, Raccoon, Sun } from "@school-ahead/preschool-ui";
import { DiamondBadge } from "@/components/header";
import { PreschoolModeToggle } from "@/components/preschool-mode-toggle";
import { Link } from "@/i18n/navigation";
import { useSignOut } from "@/lib/use-sign-out";

// A big, round-cornered card that opens one part of the app — the dashboard is
// a grid of these (see PreschoolDashboard). `children` is the picture: an
// emoji, or for the profile the child's own avatar.
function DashboardCard({
  href,
  label,
  gradient,
  children,
}: {
  href: string;
  label: string;
  gradient: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl bg-gradient-to-br p-4 text-white shadow-xl ring-4 ring-white/70 transition-transform hover:-translate-y-1 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-h-56 ${gradient}`}
    >
      <span className="flex h-24 items-center justify-center text-7xl sm:h-28 sm:text-8xl" aria-hidden="true">
        {children}
      </span>
      <span className="text-center text-xl font-extrabold leading-tight drop-shadow sm:text-2xl">{label}</span>
    </Link>
  );
}

// The child's own avatar, dressed as they chose — same idiom as the subject
// page's companion (preschool-subject-detail-page.tsx), the raccoon standing
// in until they have picked a character. On its own, with no frame around it,
// like the emojis on the other cards.
function ProfileAvatar() {
  const layers = useEquippedAvatarLayers();
  const className = "h-24 w-24 sm:h-28 sm:w-28";
  return (
    <AvatarBadge
      layers={layers}
      frame="none"
      className={className}
      fallback={<Raccoon mood="happy" className={className} />}
    />
  );
}

// The dashboard (`/`) of a student in preschool mode, in place of the classic
// site header and dashboard: a greeting with the diamonds, the mode switch and a
// waving 👋 that says bye (signs the child out — the header's menu was the only
// place for that), and a grid of big emoji cards — My lessons (the road, `/lessons`),
// Subjects, Calendar, Games, Stories and the Profile, which shows the child's
// avatar. See docs/views/preschool/README.md.
export function PreschoolDashboard() {
  const t = useTranslations("PreschoolDashboard");
  const user = useAuthStore((state) => state.user);
  const firstName = user?.name.trim().split(/\s+/)[0] ?? "";
  const { signOut } = useSignOut();

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-24 h-6 w-12 opacity-70" />
        <Sun className="right-1/4 top-6 h-8 w-8" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold text-emerald-900 sm:text-4xl">
            {firstName ? t("greeting", { name: firstName }) : t("greetingNoName")}
          </h1>
          <div className="flex items-center gap-3">
            {user?.diamondBalance != null && <DiamondBadge count={user.diamondBalance} />}
            <div className="rounded-full bg-white/90 shadow-lg ring-2 ring-gray-200">
              <PreschoolModeToggle />
            </div>
            <PreschoolButton
              icon="👋"
              label={t("bye")}
              onClick={signOut}
              ringColorClassName="ring-amber-400"
              position="static"
              className="shrink-0"
            />
          </div>
        </div>

        <nav aria-label={t("navLabel")} className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
          <DashboardCard href="/lessons" label={t("lessons")} gradient="from-rose-400 to-rose-600">
            🗺️
          </DashboardCard>
          <DashboardCard href="/subjects" label={t("subjects")} gradient="from-sky-400 to-sky-600">
            📚
          </DashboardCard>
          <DashboardCard href="/calendar" label={t("calendar")} gradient="from-emerald-400 to-emerald-600">
            📅
          </DashboardCard>
          <DashboardCard href="/games" label={t("games")} gradient="from-amber-400 to-amber-600">
            🎈
          </DashboardCard>
          <DashboardCard href="/games/stories" label={t("stories")} gradient="from-violet-400 to-violet-600">
            🧚
          </DashboardCard>
          <DashboardCard href="/profile" label={t("profile")} gradient="from-cyan-400 to-cyan-600">
            <ProfileAvatar />
          </DashboardCard>
        </nav>
      </div>
    </div>
  );
}
