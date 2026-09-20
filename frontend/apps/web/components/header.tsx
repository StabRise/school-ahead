"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthStore, useIsPreschoolStudent } from "@school-ahead/api-client";
import { useLogout, getMeQueryKey } from "@school-ahead/api-client/browser/auth/auth";
import { MainMenu } from "@/components/main-menu";
import { TutorMainMenu } from "@/components/tutor-main-menu";
import { PreschoolModeToggle } from "@/components/preschool-mode-toggle";
import { AvatarBadge, useEquippedAvatarLayers } from "@school-ahead/avatar";

function getInitials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl: string;
}) {
  // The chosen companion, fully dressed (body + equipped clothing/headwear/
  // accessory — see docs/core/avatar.md section 2), takes priority over the
  // Google account picture once a student has picked one. AvatarBadge's
  // "card" frame (the default) is the same rounded-rectangle framing as the
  // profile page's avatar editor and the tutor's student-overview card — not
  // the plain circle a real photo gets below, so the companion reads the
  // same everywhere it's shown.
  const equippedLayers = useEquippedAvatarLayers();
  if (equippedLayers.length > 0) {
    return <AvatarBadge layers={equippedLayers} className="h-8 w-8" />;
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-white">
      {getInitials(name, email)}
    </span>
  );
}

// Earned via lesson completion — see docs/core/progress.md section 2.
export function DiamondBadge({ count }: { count: number }) {
  const t = useTranslations("Header");
  return (
    <span
      data-diamond-badge
      aria-label={t("diamondBalance", { count })}
      className="flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700"
    >
      💎 {count}
    </span>
  );
}

function BrandIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4 18L11 6L14 12L20 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Header() {
  const t = useTranslations("Header");
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isPreschoolStudent = useIsPreschoolStudent();
  const clearUser = useAuthStore((state) => state.clear);

  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        clearUser();
        queryClient.removeQueries({ queryKey: getMeQueryKey() });
        router.push("/login");
      },
    });
  };

  // A student in preschool mode has no classic site header at all: the
  // dashboard has a top row of its own (greeting, diamonds, the mode switch),
  // a lesson takes over the whole screen as a fullscreen "forest clearing"
  // (docs/interfaces/student/preschool/lesson.md), and the other pages get a
  // slim strip with a 🏠 — see components/preschool/chrome.tsx.
  if (isPreschoolStudent) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <BrandIcon />
          <span>{t("brand")}</span>
        </Link>

        {user?.role === "student" && <MainMenu />}
        {user?.role === "tutor" && <TutorMainMenu />}
      </div>

      {user ? (
        <div className="flex items-center gap-3">
          {user.role === "student" && (
            // Preschool students get the full minigame hub; everyone else
            // (docs/preschool/games/cards.md's older-student audience) goes
            // straight to the study flashcards game instead.
            <Link
              href={user.interfaceMode === "preschool" ? "/games" : "/games/cards"}
              className="text-sm font-medium text-gray-500 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {t("games")}
            </Link>
          )}
          {user.role === "student" && <div className="hidden lg:block"><PreschoolModeToggle /></div>}
          {user.role === "student" && user.diamondBalance !== null && (
            <DiamondBadge count={user.diamondBalance} />
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t("userMenu")}
                className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Avatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
              >
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />
                {user.role === "student" && (
                  <>
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/achievements"
                        className="block cursor-pointer rounded-sm px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                      >
                        {t("myAchievements")}
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/profile"
                        className="block cursor-pointer rounded-sm px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                      >
                        {t("myProfile")}
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/settings"
                        className="block cursor-pointer rounded-sm px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                      >
                        {t("mySettings")}
                      </Link>
                    </DropdownMenu.Item>
                    <div className="lg:hidden">
                      <PreschoolModeToggle />
                    </div>
                    <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />
                  </>
                )}
                {user.role === "tutor" && (
                  <>
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/tutor/subjects"
                        className="block cursor-pointer rounded-sm px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                      >
                        {t("mySubjects")}
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/tutor/classes"
                        className="block cursor-pointer rounded-sm px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                      >
                        {t("myClasses")}
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />
                  </>
                )}
                <DropdownMenu.Item
                  onSelect={handleLogout}
                  className="cursor-pointer rounded-sm px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                >
                  {t("logout")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          {/* /games and the read-only subject catalogue are public — see
              lib/public-paths.ts — so a signed-out visitor can already play
              and browse before logging in. */}
          <Link
            href="/subjects"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {t("subjects")}
          </Link>
          <Link
            href="/games"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {t("games")}
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {t("login")}
          </Link>
        </div>
      )}
    </header>
  );
}
