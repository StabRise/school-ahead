"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Maximize, Minimize } from "lucide-react";
import { toSpeechText } from "@school-ahead/api-client";
import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { PreschoolButton } from "@school-ahead/preschool-ui";
import { nextAfterError, nextIndex, previousIndex } from "@/lib/playlist-queue";
import { loadYouTubeIframeApi, type YouTubePlayer } from "@/lib/youtube-iframe-api";

// Which of its two layouts the player is in — see `trackActions` below.
export type PlayerLayout = "framed" | "fullscreen";

// The tapped ▶ on the preschool subject page: an overlay that plays the
// subject's songs one after another, like a music player. One YouTube player
// (the IFrame Player API, so we hear when a video ends — a plain <iframe> embed
// can't say) is reused for every song with loadVideoById, which also keeps the
// sound going after the first one: the browser lets a page play with sound once
// the child has tapped it, and the ▶ tap is that. The video stays visible, as
// YouTube requires. See docs/views/preschool/README.md.
//
// The ⛶ button takes the whole player (video and controls) fullscreen — the
// browser's Fullscreen API where there is one, otherwise (iPhone Safari has it
// only for a bare <video>) the same layout filling the window.
//
// It opens on `startIndex` — the lesson the child tapped, when the bookshelf's ⚙️ says
// lessons play instead of opening — and, with `startFullscreen`, already fullscreen.
// `trackActions` is a slot for what belongs to the song being played (the ✅ and ❤️
// of a signed-in student, see subject-player-actions.tsx), drawn beside the
// fullscreen button in both layouts; the player itself knows nothing of students.
//
// The queue is the `tracks` it was opened with: a later change to that list (say a
// refetch) never rebuilds the YouTube player or moves the queue under the child.
//
// Mount it to open, unmount to close (which stops the music).
export function SubjectPlayer({
  tracks,
  startIndex = 0,
  startFullscreen = false,
  trackActions,
  onClose,
}: {
  tracks: PlaylistTrackOut[];
  startIndex?: number;
  startFullscreen?: boolean;
  trackActions?: (track: PlaylistTrackOut, layout: PlayerLayout) => ReactNode;
  onClose: () => void;
}) {
  const t = useTranslations("PreschoolSubjectDetail.player");
  const [queue] = useState(tracks);
  const firstIndex = queue[startIndex] ? startIndex : 0;
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  // The callbacks the YouTube player holds are made once, so what they read
  // lives in refs instead of state.
  const indexRef = useRef(firstIndex);
  const failuresInARowRef = useRef(0);
  const [index, setIndex] = useState(firstIndex);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [problem, setProblem] = useState<"load" | "play" | null>(null);
  // Fullscreen: the browser's, or — where there is none — the window filled. Opened
  // fullscreen, the window is filled from the very first frame (no framed dialog
  // flashing by) until the browser's fullscreen takes over, or refuses.
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [windowFullscreen, setWindowFullscreen] = useState(startFullscreen);
  const isFullscreen = nativeFullscreen || windowFullscreen;

  const goTo = useCallback(
    (next: number) => {
      const track = queue[next];
      if (!track) return;
      indexRef.current = next;
      setIndex(next);
      setFinished(false);
      playerRef.current?.loadVideoById(track.video_id);
    },
    [queue],
  );

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;

    loadYouTubeIframeApi()
      .then((YT) => {
        const stage = stageRef.current;
        if (cancelled || !stage) return;
        // YT.Player replaces the element it is given with its iframe, so hand it
        // one React doesn't manage.
        const holder = document.createElement("div");
        stage.appendChild(holder);
        player = new YT.Player(holder, {
          width: "100%",
          height: "100%",
          videoId: queue[indexRef.current]?.video_id,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            // Start the song the moment the player is ready — the `autoplay`
            // parameter alone can be ignored — so opening a lesson plays it. With
            // sound, and the player never mutes itself: YouTube remembers a muted
            // player (say one a child muted earlier) and would open this one silent.
            onReady: () => {
              playerRef.current?.unMute();
              playerRef.current?.playVideo();
            },
            onStateChange: ({ data }) => {
              if (data === YT.PlayerState.PLAYING) {
                failuresInARowRef.current = 0;
                setProblem(null);
                setPlaying(true);
              } else if (data === YT.PlayerState.PAUSED) {
                setPlaying(false);
              } else if (data === YT.PlayerState.ENDED) {
                setPlaying(false);
                const next = nextIndex(indexRef.current, queue.length);
                if (next === null) setFinished(true);
                else goTo(next);
              }
            },
            // A song YouTube won't play here (embedding switched off, removed,
            // ...): on to the next, and stop with a message once none plays.
            onError: () => {
              failuresInARowRef.current += 1;
              const next = nextAfterError(indexRef.current, queue.length, failuresInARowRef.current);
              if (next === null) setProblem("play");
              else goTo(next);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setProblem("load");
      });

    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
    };
  }, [queue, goTo]);

  // The browser tells us when it enters or leaves fullscreen — also when the
  // child leaves it with Escape rather than with our button.
  useEffect(() => {
    const handleChange = () => {
      const native = document.fullscreenElement === panelRef.current;
      setNativeFullscreen(native);
      // The browser's fullscreen has taken over from the filled window (see below).
      if (native) setWindowFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  // Opened fullscreen, ask the browser for its own — the tap that opened the player
  // is still fresh enough to allow it; once granted, the fullscreenchange above swaps
  // it for the filled window. Refused (a policy, an old browser), the filled window stays.
  useEffect(() => {
    if (!startFullscreen) return;
    const panel = panelRef.current;
    if (!panel?.requestFullscreen) return;
    panel.requestFullscreen().catch(() => {});
  }, [startFullscreen]);

  // Escape closes the player — first leaving the window-filling fullscreen, if
  // that is on (the browser's own fullscreen takes Escape for itself).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (windowFullscreen) setWindowFullscreen(false);
      else onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, windowFullscreen]);

  const toggleFullscreen = () => {
    if (nativeFullscreen) {
      void document.exitFullscreen();
    } else if (windowFullscreen) {
      setWindowFullscreen(false);
    } else if (panelRef.current?.requestFullscreen) {
      // Refused (a policy, an old browser): fill the window instead.
      panelRef.current.requestFullscreen().catch(() => setWindowFullscreen(true));
    } else {
      setWindowFullscreen(true);
    }
  };

  // Keep the song being played in view in the list.
  const currentItemRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    currentItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const current = queue[index];
  const handlePlayPause = () => {
    if (finished) goTo(0);
    else if (playing) playerRef.current?.pauseVideo();
    else playerRef.current?.playVideo();
  };

  const trackTitle = current ? toSpeechText(current.title) : "";

  const controls = (
    <>
      <PreschoolButton
        icon="⏮️"
        label={t("previous")}
        onClick={() => goTo(previousIndex(index))}
        ringColorClassName="ring-sky-400"
        position="static"
      />
      <PreschoolButton
        icon={finished ? "🔁" : playing ? "⏸️" : "▶️"}
        label={finished ? t("again") : playing ? t("pause") : t("play")}
        onClick={handlePlayPause}
        ringColorClassName="ring-emerald-400"
        position="static"
      />
      <PreschoolButton
        icon="⏭️"
        label={t("next")}
        onClick={() => {
          const next = nextIndex(index, queue.length);
          if (next !== null) goTo(next);
        }}
        ringColorClassName="ring-sky-400"
        position="static"
      />
    </>
  );
  const fullscreenButton = (
    <PreschoolButton
      icon={
        isFullscreen ? (
          <Minimize className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Maximize className="h-5 w-5" aria-hidden="true" />
        )
      }
      label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
      onClick={toggleFullscreen}
      ringColorClassName="ring-sky-400"
      position="static"
      className="shrink-0"
    />
  );
  const actions = current && trackActions ? trackActions(current, isFullscreen ? "fullscreen" : "framed") : null;
  const closeButton = (
    <PreschoolButton
      icon="✕"
      label={t("close")}
      onClick={onClose}
      ringColorClassName="ring-rose-400"
      position="static"
      className="shrink-0"
    />
  );

  // Two layouts around ONE video container (the `stageRef` div stays in the same
  // place in the tree, so toggling fullscreen never rebuilds the YouTube iframe
  // inside it): the framed dialog, and fullscreen — near-black all round, edge to
  // edge (no margins at the sides), no bar on top, and a slim bar underneath with
  // the title (small) on the left, the controls, and on the right the way out of
  // fullscreen and the close button.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className={`fixed inset-0 z-60 flex items-center justify-center bg-black/60 ${isFullscreen ? "" : "p-3"}`}
    >
      <div
        ref={panelRef}
        className={`flex w-full flex-col ${
          isFullscreen
            ? "h-full max-w-none bg-neutral-950"
            : "max-h-full max-w-5xl gap-3 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl"
        }`}
      >
        {!isFullscreen && (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-lg font-extrabold text-purple-800">🎵 {trackTitle}</p>
            <span className="shrink-0 rounded-full bg-purple-100 px-3 py-1 text-sm font-bold text-purple-800">
              {t("position", { current: index + 1, total: queue.length })}
            </span>
            {actions}
            {fullscreenButton}
            {closeButton}
          </div>
        )}

        {/* The video has to stay visible (YouTube's terms), so this is the player,
            not a hidden audio track. */}
        <div
          ref={stageRef}
          className={`w-full overflow-hidden bg-black [&>iframe]:h-full [&>iframe]:w-full ${
            isFullscreen ? "min-h-0 flex-1" : "aspect-video rounded-2xl"
          }`}
        />

        {problem && (
          <p
            role="alert"
            className={`text-center text-sm font-medium ${isFullscreen ? "pt-2 text-red-300" : "text-red-700"}`}
          >
            {problem === "load" ? t("loadError") : t("playError")}
          </p>
        )}
        {finished && (
          <p className={`text-center text-sm font-bold ${isFullscreen ? "pt-2 text-emerald-300" : "text-emerald-800"}`}>
            {t("finished")}
          </p>
        )}

        {!isFullscreen && <div className="flex items-center justify-center gap-3">{controls}</div>}
        {isFullscreen && (
          <div className="flex items-center gap-3 py-2">
            <p className="min-w-0 flex-1 truncate text-xs text-neutral-300">
              🎵 {trackTitle}
              <span className="ml-2 text-neutral-500">{t("position", { current: index + 1, total: queue.length })}</span>
            </p>
            <div className="flex items-center gap-2">{controls}</div>
            <div className="flex flex-1 items-center justify-end gap-2">
              {actions}
              {fullscreenButton}
              {closeButton}
            </div>
          </div>
        )}

        {/* Fullscreen is for the video; the list is one tap away, leaving it. */}
        <ol aria-label={t("list")} className={`max-h-56 flex-col gap-1 overflow-y-auto ${isFullscreen ? "hidden" : "flex"}`}>
          {queue.map((track, position) => (
            <li key={track.lesson_id} ref={position === index ? currentItemRef : undefined}>
              <button
                type="button"
                onClick={() => goTo(position)}
                aria-current={position === index ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm font-bold transition-colors ${
                  position === index ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-900 hover:bg-purple-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, not a static asset */}
                <img
                  src={`https://i.ytimg.com/vi/${track.video_id}/default.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-9 w-12 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1 truncate">{toSpeechText(track.title)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
