"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Video } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubjectTopicsQueryKey, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import {
  getListTutorSubjectLessonsQueryKey,
  useImportTutorSubjectYoutubePlaylist,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { YoutubeImportOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Opened from the tutor's Subject detail page — takes a public YouTube playlist
// link (or a single video's, which makes just one lesson) and scrapes it
// server-side (same algorithm as manage.py's tmp_scrape_lessons
// -Y, see backend's lessons/youtube_scrape.py) straight into one Topic
// with one theory Lesson per video, reusing an existing Topic by exact
// title so re-running this against the same (or a grown) playlist only
// adds genuinely new videos instead of duplicating lessons.
export function LoadYoutubePlaylistDialog({ subjectId }: { subjectId: number }) {
  const t = useTranslations("LoadYoutubePlaylist");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [result, setResult] = useState<YoutubeImportOut | null>(null);

  const importPlaylist = useImportTutorSubjectYoutubePlaylist();

  // The subject's existing topics, offered as suggestions on the topic field:
  // typing a new name makes a new topic, picking (or typing) an existing
  // title puts the lessons into that topic — the import matches by exact title.
  const topicsQuery = useListSubjectTopics(subjectId);
  const topicTitles = useMemo(
    () => Array.from(new Set((topicsQuery.data ?? []).map((topic) => topic.title))),
    [topicsQuery.data],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTopicName("");
      setPlaylistUrl("");
      setResult(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrl.trim()) return;

    importPlaylist.mutate(
      { subjectId, data: { topic_name: topicName.trim(), playlist_url: playlistUrl } },
      {
        onSuccess: (data) => {
          setResult(data);
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("triggerButton")}
          aria-label={t("triggerButton")}
          className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
        >
          <Video className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">📥 {t("title")}</Dialog.Title>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <ul className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                <li>{t("resultTopic", { topic: result.topic_name })}</li>
                <li>{t("lessonsCreated", { count: result.lessons_created })}</li>
                <li>{t("lessonsSkipped", { count: result.lessons_skipped })}</li>
              </ul>
              {result.truncated && <p className="text-xs text-amber-700">⚠️ {t("truncatedWarning")}</p>}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="self-end rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  {t("closeButton")}
                </button>
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="youtube-playlist-url" className="text-xs font-medium text-gray-700">
                  {t("urlLabel")}
                </label>
                <input
                  id="youtube-playlist-url"
                  type="url"
                  required
                  placeholder="https://www.youtube.com/…"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="youtube-topic-name" className="text-xs font-medium text-gray-700">
                  {t("topicNameLabel")}
                </label>
                <input
                  id="youtube-topic-name"
                  type="text"
                  list="youtube-topic-options"
                  autoComplete="off"
                  placeholder={t("topicNamePlaceholder")}
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                />
                <datalist id="youtube-topic-options">
                  {topicTitles.map((title) => (
                    <option key={title} value={title} />
                  ))}
                </datalist>
              </div>

              {importPlaylist.isError && <p className="text-sm text-red-600">{t("importError")}</p>}

              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("cancelButton")}
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={!playlistUrl.trim() || importPlaylist.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {importPlaylist.isPending ? t("importing") : t("importButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
