"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useLogout, getMeQueryKey } from "@/lib/api/browser/auth/auth";
import { MainMenu } from "@/components/main-menu";
import { TutorMainMenu } from "@/components/tutor-main-menu";
import { PreschoolModeToggle } from "@/components/preschool-mode-toggle";
import { EquippedAvatarLayers, useEquippedAvatarLayers } from "@/components/equipped-avatar";

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
  // accessory — see docs/core/avatar.md section 2 and
  // components/equipped-avatar.tsx), takes priority over the Google account
  // picture once a student has picked one. Its SVG artwork has no margin
  // baked in, so it's shown with object-contain and extra padding instead
  // of the object-cover crop used for real account photos.
  const equippedLayers = useEquippedAvatarLayers();
  if (equippedLayers.length > 0) {
    return (
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-100">
        <span className="h-6 w-6">
          <EquippedAvatarLayers layers={equippedLayers} />
        </span>
      </span>
    );
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
function DiamondBadge({ count }: { count: number }) {
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
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
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

  // Preschool lessons take over the whole screen as a fullscreen "forest
  // clearing" — see docs/interfaces/student/preschool/lesson.md.
  if (user?.interfaceMode === "preschool" && /^\/lessons\//.test(pathname)) {
    return null;
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <BrandIcon />
          <span>{t("brand")}</span>
        </Link>

        {user?.role === "student" && (
          <MainMenu isPreschool={user.interfaceMode === "preschool"} />
        )}
        {user?.role === "tutor" && <TutorMainMenu />}
      </div>

      {user ? (
        <div className="flex items-center gap-3">
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
        <Link
          href="/login"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {t("login")}
        </Link>
      )}
    </header>
  );
}
