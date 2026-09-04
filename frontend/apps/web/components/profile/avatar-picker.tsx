"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useListAvatars, useUpdateAvatar } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore } from "@school-ahead/api-client";

// Character-companion picker — docs/core/avatar.md section 2.1 ("Initial
// Selection"). The wardrobe (clothing/headwear/accessory — see
// AvatarWardrobe) and home-decoration systems that doc also describes are
// separate sections; this is deliberately just the base-body selection
// step, on its own catalog (Avatar) and endpoint so those can layer on top.
export function AvatarPicker({ onSelected }: { onSelected?: () => void } = {}) {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const isPreschool = user?.interfaceMode === "preschool";
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const { data: avatars, isLoading, isError } = useListAvatars();
  const updateAvatar = useUpdateAvatar();
  const isNoneSelected = !user?.equippedAvatar;

  // Fires `onSelected` (e.g. closing a picker dialog — see
  // components/profile/change-character-dialog.tsx) only once the store is
  // actually updated, not eagerly on tap — TanStack Query's per-mutate
  // onSuccess/onError/onSettled callbacks are tied to the calling
  // component's lifecycle, so closing (and unmounting AvatarPicker, tearing
  // down this useUpdateAvatar() instance) before the request resolves would
  // silently drop the callback: the PATCH still succeeds server-side, but
  // setUser() below never runs, so the new avatar only shows up after a
  // full reload's fresh GET /auth/me. The "nothing to wait for" cases
  // (already selected, or a mutation already in flight) still close right
  // away since there's no pending callback to lose.
  const handleSelect = (avatarId: number | null) => {
    if (updateAvatar.isPending || (user?.equippedAvatar?.id ?? null) === avatarId) {
      onSelected?.();
      return;
    }
    updateAvatar.mutate(
      { data: { avatar_id: avatarId } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
          onSelected?.();
        },
      },
    );
  };

  const tileClassName = isPreschool
    ? "flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-100 sm:h-24 sm:w-24"
    : "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gray-100";
  const labelClassName = `font-medium text-gray-700 ${isPreschool ? "text-base" : "text-xs"}`;

  return (
    <div className="flex flex-col gap-3">
      <h3 className={`font-semibold ${isPreschool ? "text-2xl" : "text-lg"}`}>{t("avatarSectionTitle")}</h3>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {avatars && avatars.length > 0 && (
        <div className={`grid gap-3 ${isPreschool ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"}`}>
          <button
            type="button"
            onClick={() => handleSelect(null)}
            disabled={updateAvatar.isPending}
            aria-pressed={isNoneSelected}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors disabled:cursor-default disabled:opacity-60 ${
              isNoneSelected
                ? isPreschool
                  ? "border-4 border-emerald-400 bg-emerald-50"
                  : "border-gray-900 bg-gray-900/5"
                : isPreschool
                  ? "border-2 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {/* Same "none" glyph as the wardrobe slots (wardrobeNone) —
                header.tsx already falls back to the Google account picture,
                or generated initials if there isn't one, once
                equippedAvatar is cleared. */}
            <span className={`${tileClassName} text-2xl text-gray-400`}>🚫</span>
            <span className={labelClassName}>{t("avatarNoneLabel")}</span>
          </button>
          {avatars.map((avatar) => {
            const isSelected = user?.equippedAvatar?.id === avatar.id;
            return (
              <button
                key={avatar.id}
                type="button"
                onClick={() => handleSelect(avatar.id)}
                disabled={updateAvatar.isPending}
                aria-pressed={isSelected}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors disabled:cursor-default disabled:opacity-60 ${
                  isSelected
                    ? isPreschool
                      ? "border-4 border-emerald-400 bg-emerald-50"
                      : "border-gray-900 bg-gray-900/5"
                    : isPreschool
                      ? "border-2 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className={tileClassName}>
                  {avatar.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar.image} alt="" className="h-full w-full object-contain" />
                  ) : null}
                </span>
                <span className={labelClassName}>{avatar.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
