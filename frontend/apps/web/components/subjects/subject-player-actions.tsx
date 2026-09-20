"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { useAuthStore } from "@school-ahead/api-client";
import { getMeQueryKey } from "@school-ahead/api-client/browser/auth/auth";
import {
  confirmUnderstanding,
  getGetNextLessonQueryKey,
  getGetStudentLessonQueryKey,
  getGetSubjectProgressQueryKey,
  getListStudentSubjectLessonsPageQueryKey,
  getListStudentSubjectLessonsQueryKey,
  getListStudentSubjectLessonTopicsQueryKey,
  getListStudentSubjectPlaylistQueryKey,
  getStudentLesson,
  setStudentLessonFavorite,
  startLessonToday,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { getGetTodayQueryKey } from "@school-ahead/api-client/browser/schedule/schedule";
import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { PreschoolButton } from "@school-ahead/preschool-ui";
import { useRouter } from "@/i18n/navigation";
import { HeartIcon } from "@/components/preschool/heart-icon";
import { useSubjectPlaylist } from "@/components/subjects/use-subject-lessons";
import type { PlayerLayout } from "@/components/subjects/subject-player";
import { studentLessonHref, type PreschoolLessonStep } from "@/lib/lesson-step";
import { canGoToPractice, canStartTrack, markDoneState, trackLessonTarget } from "@/lib/playlist-track-actions";

const NOTICE_MS = 2500;

// What a lesson that was just created or finished changes on the page behind the
// player (the same set a lesson card refreshes on starting one).
function useRefreshSubjectPage(subjectId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsPageQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonTopicsQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getGetNextLessonQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getGetSubjectProgressQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getGetTodayQueryKey() });
  };
}

// The title of the song being played leads to its lesson (SubjectPlayer's
// `openTrack`): a visitor gets the read-only lesson, a student their own lesson
// screen — created first, as a lesson card would, when they have none yet and may
// start any. What the student has is read from the playlist query's cache, which the
// ✅ and ❤️ edit, so a lesson those just created is opened, not created twice. Leaving
// the page takes the player (and the browser's fullscreen) with it. Asked for the
// "practice" step it opens the student's lesson on its quiz or task (a visitor's
// read-only preview has no such step).
export function useTrackLessonOpener({
  subjectId,
  topicId,
  guest,
}: {
  subjectId: number;
  topicId: number | undefined;
  guest: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canDoAnyLesson = useAuthStore((state) => state.user?.canDoAnyLesson ?? false);
  const playlist = useSubjectPlaylist(subjectId, topicId, guest).data;
  const refreshSubjectPage = useRefreshSubjectPage(subjectId);

  return (track: PlaylistTrackOut, step: PreschoolLessonStep = "theory"): (() => void) | undefined => {
    const live = playlist?.find((entry) => entry.lesson_id === track.lesson_id) ?? track;
    const target = trackLessonTarget(live, { guest, canDoAnyLesson });
    switch (target?.kind) {
      case "preview":
        return () => router.push(`/lessons/preview/${target.lessonId}`);
      case "lesson":
        return () => router.push(studentLessonHref(target.studentLessonId, step));
      case "start":
        return () => {
          void startLessonToday(target.lessonId)
            .then((started) => {
              if (topicId !== undefined) {
                queryClient.setQueryData<PlaylistTrackOut[]>(
                  getListStudentSubjectPlaylistQueryKey(subjectId, { topic_id: topicId }),
                  (tracks) =>
                    tracks?.map((entry) =>
                      entry.lesson_id === target.lessonId
                        ? { ...entry, student_lesson_id: started.student_lesson_id, status: entry.status ?? "assigned" }
                        : entry,
                    ),
                );
              }
              refreshSubjectPage();
              router.push(studentLessonHref(started.student_lesson_id, step));
            })
            // Nothing to show in fullscreen (a dialog wouldn't be drawn): the title stays, to tap again.
            .catch(() => {});
        };
      default:
        return undefined;
    }
  };
}

// The ✅, ➡️ and ❤️ of the song being played in the subject page's player
// (SubjectPlayer's `trackActions` slot), for a signed-in student — beside the
// button that leaves fullscreen, in the framed player and in fullscreen alike:
//   ❤️ marks the lesson as a favourite (StudentLesson.is_favorite, the lesson
//      screen's heart), flipping at once and rolled back if the request fails;
//   ✅ marks a theory lesson done, the way the lesson screen's "Чи все зрозуміло?" →
//      "Так" does (see lib/playlist-track-actions.ts); a lesson already done shows a
//      plain green ✅ instead — an icon, not a button;
//   ➡️ for a lesson that is not theory (a quiz or a task, which a tap here can't
//      finish) and is not done yet takes the child to it: the student's lesson, opened on
//      step 2. Once it is done the ✅ icon is all there is.
// A song the student has no StudentLesson for yet gets today's one created by the
// first tap, exactly as a lesson card does.
//
// The state shown is the song's entry in the playlist query's cache, which every
// tap edits — so it survives the buttons being remounted when the player goes in
// and out of fullscreen, and is right the next time the player opens. Nothing is
// drawn as a dialog: the browser shows only the fullscreen element, so errors and the
// diamonds earned appear in place.
export function PlayerTrackActions({
  subjectId,
  topicId,
  track,
  layout,
}: {
  subjectId: number;
  topicId: number;
  track: PlaylistTrackOut;
  layout: PlayerLayout;
}) {
  const t = useTranslations("PreschoolSubjectDetail.player");
  const queryClient = useQueryClient();
  const canDoAnyLesson = useAuthStore((state) => state.user?.canDoAnyLesson ?? false);
  const addDiamonds = useAuthStore((state) => state.addDiamonds);
  const playlist = useSubjectPlaylist(subjectId, topicId, false).data;
  const live = playlist?.find((entry) => entry.lesson_id === track.lesson_id) ?? track;

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ kind: "error" | "diamonds"; amount?: number } | null>(null);
  const noticeTimerRef = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  const showNotice = (next: { kind: "error" | "diamonds"; amount?: number }) => {
    setNotice(next);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const playlistKey = getListStudentSubjectPlaylistQueryKey(subjectId, { topic_id: topicId });
  const patchTrack = (patch: Partial<PlaylistTrackOut>) =>
    queryClient.setQueryData<PlaylistTrackOut[]>(playlistKey, (tracks) =>
      tracks?.map((entry) => (entry.lesson_id === track.lesson_id ? { ...entry, ...patch } : entry)),
    );

  const refreshSubjectPage = useRefreshSubjectPage(subjectId);
  const openLesson = useTrackLessonOpener({ subjectId, topicId, guest: false });
  const openPractice = canGoToPractice(live) ? openLesson(live, "practice") : undefined;

  const ensureStudentLesson = async (): Promise<number> => {
    if (live.student_lesson_id != null) return live.student_lesson_id;
    const started = await startLessonToday(live.lesson_id);
    patchTrack({ student_lesson_id: started.student_lesson_id, status: live.status ?? "assigned" });
    return started.student_lesson_id;
  };

  // One request at a time: the second tap of a double tap does nothing.
  const run = async (action: () => Promise<void>, onError: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      onError();
      showNotice({ kind: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleFavorite = () => {
    const next = !live.is_favorite;
    patchTrack({ is_favorite: next });
    void run(
      async () => {
        const studentLessonId = await ensureStudentLesson();
        await setStudentLessonFavorite(studentLessonId, { is_favorite: next });
        refreshSubjectPage();
      },
      () => patchTrack({ is_favorite: !next }),
    );
  };

  const handleDone = () => {
    void run(
      async () => {
        const studentLessonId = await ensureStudentLesson();
        // Opening a lesson is what moves it from assigned to in progress (there is
        // no separate "start"), and only an in-progress lesson can be confirmed.
        const opened = await getStudentLesson(studentLessonId);
        if (opened.status !== "completed") {
          const result = await confirmUnderstanding(studentLessonId, { understood: true });
          if (result.diamonds_awarded > 0) {
            addDiamonds(result.diamonds_awarded);
            queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
            showNotice({ kind: "diamonds", amount: result.diamonds_awarded });
          }
        }
        patchTrack({ status: "completed" });
        queryClient.invalidateQueries({ queryKey: getGetStudentLessonQueryKey(studentLessonId) });
        refreshSubjectPage();
      },
      () => {},
    );
  };

  const doneState = markDoneState(live, canDoAnyLesson);
  const canFavorite = canStartTrack(live, canDoAnyLesson);
  if (doneState === "hidden" && !canFavorite && !openPractice) return null;

  return (
    <div className="relative flex shrink-0 items-center gap-2" aria-busy={busy}>
      {doneState === "available" && (
        <PreschoolButton
          icon={<Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
          label={t("markDone")}
          ringColorClassName="ring-emerald-400"
          position="static"
          className="shrink-0"
          onClick={handleDone}
        />
      )}
      {doneState === "done" && (
        // Only says it is done: no ring, no pointer — nothing to press.
        <span
          role="img"
          aria-label={t("done")}
          className="flex h-9 w-9 shrink-0 cursor-default select-none items-center justify-center text-2xl"
        >
          ✅
        </span>
      )}
      {openPractice && (
        <PreschoolButton
          icon={<ArrowRight className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
          label={live.lesson_type === "with_quiz" ? t("goToQuiz") : t("goToTask")}
          ringColorClassName="ring-emerald-400"
          position="static"
          className="shrink-0"
          onClick={openPractice}
        />
      )}
      {canFavorite && (
        <PreschoolButton
          icon={<HeartIcon filled={live.is_favorite ?? false} className="h-5 w-5" />}
          label={live.is_favorite ? t("favoriteRemove") : t("favoriteAdd")}
          ringColorClassName="ring-rose-400"
          position="static"
          className="shrink-0"
          onClick={handleFavorite}
        />
      )}
      {notice && (
        <span
          role={notice.kind === "error" ? "alert" : "status"}
          className={`absolute right-0 z-10 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold shadow-lg ${
            layout === "fullscreen" ? "bottom-full mb-2" : "top-full mt-2"
          } ${notice.kind === "error" ? "bg-red-600 text-white" : "bg-cyan-100 text-cyan-800"}`}
        >
          {notice.kind === "error" ? t("actionError") : t("diamondsEarned", { count: notice.amount ?? 0 })}
        </span>
      )}
    </div>
  );
}
