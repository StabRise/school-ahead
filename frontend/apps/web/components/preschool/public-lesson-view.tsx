"use client";

import { useTranslations } from "next-intl";
import { useGetPublicLesson } from "@school-ahead/api-client/browser/public/public";
import { Link } from "@/i18n/navigation";
import { ExitButton, MagicScreen, PreschoolLessonScene } from "@/components/preschool/lesson-view";

// A lesson for a visitor who isn't signed in — the preschool lesson screen's
// first step (the title over the framed video/text) and nothing else. There is
// no StudentLesson behind it, so no practice step (quiz, task, "did you
// understand?"), no favourite heart and no "something's wrong" flag: those all
// write to the student's own lesson. Instead of "continue" the child (or their
// parent) is invited to sign in. Only reachable for a lesson of a public class
// (Class.is_public) — anything else 404s and shows the error line. See
// docs/core/public_access.md.
export function PreschoolPublicLessonView({ lessonId }: { lessonId: number }) {
  const t = useTranslations("PreschoolLesson");
  const { data, isLoading, isError } = useGetPublicLesson(lessonId);

  return (
    <PreschoolLessonScene>
      <ExitButton subjectId={data?.subject_id ?? null} />

      {isLoading && <p className="relative m-auto text-lg font-medium text-emerald-900">{t("loading")}</p>}
      {isError && <p className="relative m-auto text-lg font-medium text-red-700">{t("error")}</p>}

      {data && (
        <MagicScreen title={data.title} content={data.content}>
          <Link
            href="/login"
            className="rounded-full bg-emerald-500 px-8 py-4 text-xl font-extrabold text-white shadow-xl transition-transform active:scale-95"
          >
            {t("guestLoginButton")} 🔑
          </Link>
        </MagicScreen>
      )}
    </PreschoolLessonScene>
  );
}
