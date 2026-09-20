"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuthStore, useIsGuest, useIsPreschoolStudent } from "@school-ahead/api-client";
import { isPublicCataloguePage } from "@/lib/preschool-chrome";
import { useSignOut } from "@/lib/use-sign-out";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
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

// Google's four-colour "G" — the mark the sign-in button carries.
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.27a12 12 0 0 0 0 10.74l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

// /subjects, the fairy tales and /games are public — see lib/public-paths.ts —
// so a signed-out visitor can already browse and play before logging in.
function GuestNav() {
  const t = useTranslations("Header");
  const links = [
    { href: "/subjects", label: t("subjects") },
    { href: "/games/stories", label: t("stories") },
    { href: "/games", label: t("games") },
  ] as const;
  return (
    <nav aria-label={t("mainMenu")} className="hidden items-center gap-6 sm:flex">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Header() {
  const t = useTranslations("Header");
  const user = useAuthStore((state) => state.user);
  const isPreschoolStudent = useIsPreschoolStudent();
  const isGuest = useIsGuest();
  const pathname = usePathname();
  const { signOut: handleLogout } = useSignOut();

  // A student in preschool mode has no classic site header at all: the
  // dashboard has a top row of its own (greeting, diamonds, the mode switch),
  // a lesson takes over the whole screen as a fullscreen "forest clearing"
  // (docs/interfaces/student/preschool/lesson.md), and the other pages get a
  // slim strip with a 🏠 — see components/preschool/chrome.tsx.
  if (isPreschoolStudent) {
    return null;
  }
  // A visitor who isn't signed in has none either on the public catalogue (the
  // bookshelf and a subject): those show only a 🏠 to the root — see
  // lib/preschool-chrome.ts and components/preschool/chrome.tsx.
  if (isGuest && isPublicCataloguePage(pathname)) {
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
        {!user && <GuestNav />}
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
        <GoogleSignInButton
          errorAlign="right"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm group-hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <GoogleIcon />
          {t("loginWithGoogle")}
        </GoogleSignInButton>
      )}
    </header>
  );
}
