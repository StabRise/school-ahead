"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getMeQueryKey,
  useJoinClass,
  useListJoinableClasses,
} from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser, useAuthStore } from "@school-ahead/api-client";
import { SimplePageContainer } from "@/components/simple/page-container";

// What a student with no class sees instead of their dashboard — e.g. a
// brand-new Google sign-up, who has no StudentProfile yet. Offers every class
// they can join themselves (backend Class.is_self_enrollable — "Pre"); joining
// creates the profile and puts them in that class (accounts.api.join_class),
// after which the regular dashboard takes over.
export function JoinClassPrompt() {
  const t = useTranslations("JoinClass");
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const { data: classes, isLoading } = useListJoinableClasses();
  const joinClass = useJoinClass();

  const handleJoin = (classId: number) => {
    joinClass.mutate(
      { data: { class_id: classId } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          void queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  return (
    <SimplePageContainer title={t("title")}>
      <div className="flex max-w-xl flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-700">{t("description")}</p>
        {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
        {classes && classes.length === 0 && (
          <p className="text-sm text-gray-500">{t("noClasses")}</p>
        )}
        {classes && classes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {classes.map((schoolClass) => (
              <button
                key={schoolClass.id}
                type="button"
                onClick={() => handleJoin(schoolClass.id)}
                disabled={joinClass.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {t("joinButton", { name: schoolClass.name })}
              </button>
            ))}
          </div>
        )}
        {joinClass.isError && (
          <p className="text-sm text-red-600">{t("joinError")}</p>
        )}
      </div>
    </SimplePageContainer>
  );
}
