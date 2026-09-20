"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
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
import { HeartIcon } from "@/components/preschool/heart-icon";
import { useSubjectPlaylist } from "@/components/subjects/use-subject-lessons";
import type { PlayerLayout } from "@/components/subjects/subject-player";
import { canStartTrack, markDoneState } from "@/lib/playlist-track-actions";

const NOTICE_MS = 2500;

// The ✅ and ❤️ of the song being played in the subject page's player
// (SubjectPlayer's `trackActions` slot), for a signed-in student — beside the
// button that leaves fullscreen, in the framed player and in fullscreen alike:
//   ❤️ marks the lesson as a favourite (StudentLesson.is_favorite, the lesson
//      screen's heart), flipping at once and rolled back if the request fails;
//   ✅ marks the lesson done, the way the lesson screen's "Чи все зрозуміло?" →
//      "Так" does (see lib/playlist-track-actions.ts for which lessons offer it).
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

  // What a lesson that was just created or finished changes on the page behind the
  // player (the same set a lesson card refreshes on starting one).
  const refreshSubjectPage = () => {
    queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsPageQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonTopicsQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getGetNextLessonQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getGetSubjectProgressQueryKey(subjectId) });
    queryClient.invalidateQueries({ queryKey: getGetTodayQueryKey() });
  };

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
  if (doneState === "hidden" && !canFavorite) return null;

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
        <PreschoolButton
          icon="✅"
          label={t("done")}
          ringColorClassName="ring-emerald-500"
          position="static"
          className="shrink-0"
          onClick={() => {}}
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
