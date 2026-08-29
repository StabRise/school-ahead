"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useListAvatars, useUpdateAvatar } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { useAuthStore } from "@/stores/auth-store";

// Character-companion picker — docs/core/avatar.md section 2.1 ("Initial
// Selection"). The wardrobe (clothing/headwear/accessory — see
// AvatarWardrobe) and home-decoration systems that doc also describes are
// separate sections; this is deliberately just the base-body selection
// step, on its own catalog (Avatar) and endpoint so those can layer on top.
export function AvatarPicker() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const { data: avatars, isLoading, isError } = useListAvatars();
  const updateAvatar = useUpdateAvatar();

  const handleSelect = (avatarId: number) => {
    if (updateAvatar.isPending || user?.equippedAvatar?.id === avatarId) return;
    updateAvatar.mutate(
      { data: { avatar_id: avatarId } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{t("avatarSectionTitle")}</h3>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {avatars && avatars.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
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
                    ? "border-gray-900 bg-gray-900/5"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                  {avatar.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar.image} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="text-xs font-medium text-gray-700">{avatar.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
