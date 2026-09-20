import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import messages from "../../messages/uk.json";
import { SubjectPlayer } from "./subject-player";

// React only flushes updates inside act() when it knows it's in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A stand-in for the YouTube IFrame API: it records what the player is asked to
// do and lets a test play the part of YouTube (an ended video, an error).
const { players, fakeYouTube } = vi.hoisted(() => {
  interface Options {
    videoId?: string;
    events?: {
      onStateChange?: (event: { data: number }) => void;
      onError?: (event: { data: number }) => void;
    };
  }
  const players: FakePlayer[] = [];
  class FakePlayer {
    loaded: string[] = [];
    destroyed = false;
    playVideo = vi.fn();
    pauseVideo = vi.fn();
    constructor(
      public element: HTMLElement,
      public options: Options,
    ) {
      players.push(this);
    }
    loadVideoById(videoId: string) {
      this.loaded.push(videoId);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const fakeYouTube = {
    Player: FakePlayer,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  };
  return { players, fakeYouTube };
});

vi.mock("@/lib/youtube-iframe-api", () => ({
  loadYouTubeIframeApi: () => Promise.resolve(fakeYouTube),
}));

const tracks: PlaylistTrackOut[] = [
  { lesson_id: 1, title: "**Hello Song** — вчимося", video_id: "video000001" },
  { lesson_id: 2, title: "Up and Down", video_id: "video000002" },
  { lesson_id: 3, title: "Let's Count", video_id: "video000003" },
];

let host: HTMLDivElement;
let root: Root;
let onClose: Mock<() => void>;

async function open(list: PlaylistTrackOut[] = tracks) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="uk" messages={messages}>
        <SubjectPlayer tracks={list} onClose={onClose} />
      </NextIntlClientProvider>,
    );
  });
}

beforeEach(() => {
  // jsdom has no layout, so no scrollIntoView (every real browser does).
  Element.prototype.scrollIntoView = vi.fn();
  players.length = 0;
  onClose = vi.fn<() => void>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const player = () => players[0];
const text = () => host.textContent ?? "";
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const label = (key: string) => (messages.PreschoolSubjectDetail.player as Record<string, string>)[key];
const youtube = (fn: () => void) => act(fn);

describe("SubjectPlayer", () => {
  it("starts on the first song, with its plain title and place in the queue", async () => {
    await open();

    expect(players).toHaveLength(1);
    expect(player().options.videoId).toBe("video000001");
    expect(text()).toContain("Hello Song — вчимося"); // the markdown is stripped
    expect(text()).toContain("1 з 3");
  });

  it("plays the next song when one ends, and so on", async () => {
    await open();

    await youtube(() => player().options.events?.onStateChange?.({ data: fakeYouTube.PlayerState.ENDED }));
    expect(player().loaded).toEqual(["video000002"]);
    expect(text()).toContain("2 з 3");

    await youtube(() => player().options.events?.onStateChange?.({ data: fakeYouTube.PlayerState.ENDED }));
    expect(player().loaded).toEqual(["video000002", "video000003"]);
    expect(text()).toContain("3 з 3");
  });

  it("stops after the last song and offers to play again", async () => {
    await open([tracks[0]]);

    await youtube(() => player().options.events?.onStateChange?.({ data: fakeYouTube.PlayerState.ENDED }));

    expect(player().loaded).toEqual([]);
    expect(text()).toContain(label("finished"));
    await youtube(() => button(label("again"))?.click());
    expect(player().loaded).toEqual(["video000001"]);
  });

  it("skips a song YouTube won't play", async () => {
    await open();

    await youtube(() => player().options.events?.onError?.({ data: 101 }));

    expect(player().loaded).toEqual(["video000002"]);
  });

  it("gives up, instead of looping, when no song can be played", async () => {
    await open(tracks.slice(0, 2));

    await youtube(() => player().options.events?.onError?.({ data: 150 }));
    await youtube(() => player().options.events?.onError?.({ data: 150 }));

    expect(player().loaded).toEqual(["video000002"]); // went on once, then stopped
    expect(text()).toContain(label("playError"));
  });

  it("goes to the next and the previous song from the buttons, and to any song in the list", async () => {
    await open();

    await youtube(() => button(label("next"))?.click());
    expect(player().loaded).toEqual(["video000002"]);

    await youtube(() => button(label("previous"))?.click());
    expect(player().loaded).toEqual(["video000002", "video000001"]);

    const third = [...host.querySelectorAll<HTMLButtonElement>("ol button")][2];
    await youtube(() => third.click());
    expect(player().loaded.at(-1)).toBe("video000003");
    expect(text()).toContain("3 з 3");
  });

  it("pauses and resumes", async () => {
    await open();
    await youtube(() => player().options.events?.onStateChange?.({ data: fakeYouTube.PlayerState.PLAYING }));

    await youtube(() => button(label("pause"))?.click());
    expect(player().pauseVideo).toHaveBeenCalled();

    await youtube(() => player().options.events?.onStateChange?.({ data: fakeYouTube.PlayerState.PAUSED }));
    await youtube(() => button(label("play"))?.click());
    expect(player().playVideo).toHaveBeenCalled();
  });

  it("closes from the ✕ and from Escape", async () => {
    await open();

    await youtube(() => button(label("close"))?.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    await youtube(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe("fullscreen", () => {
    const pressEscape = () => youtube(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    it("fills the window where the browser has no Fullscreen API, and Escape leaves it before closing", async () => {
      await open();
      expect(button(label("fullscreen"))).not.toBeNull();

      await youtube(() => button(label("fullscreen"))?.click());
      expect(button(label("exitFullscreen"))).not.toBeNull();
      expect(host.querySelector("ol")?.className).toContain("hidden"); // the video gets the room

      await pressEscape();
      expect(button(label("fullscreen"))).not.toBeNull();
      expect(onClose).not.toHaveBeenCalled();

      await pressEscape();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("keeps the very same video container when fullscreen is toggled, so the video is not rebuilt", async () => {
      await open();
      const stage = player().element.parentElement;
      expect(stage?.isConnected).toBe(true);

      await youtube(() => button(label("fullscreen"))?.click());
      expect(player().element.parentElement).toBe(stage);
      expect(player().element.isConnected).toBe(true);

      await youtube(() => button(label("exitFullscreen"))?.click());
      expect(player().element.parentElement).toBe(stage);
      expect(players).toHaveLength(1);
      expect(player().destroyed).toBe(false);
    });

    it("has no bar on top in fullscreen — the title, controls and exit/close are in one bar underneath", async () => {
      await open();
      await youtube(() => button(label("fullscreen"))?.click());

      const exit = button(label("exitFullscreen"));
      const close = button(label("close"));
      const previous = button(label("previous"));
      expect(exit?.parentElement).toBe(close?.parentElement); // the right-hand group
      const bar = exit?.closest("div.flex.items-center.gap-3");
      expect(bar?.contains(previous ?? null)).toBe(true); // controls in the same bar
      expect(bar?.textContent).toContain("Hello Song — вчимося"); // the title, on the left
      // The bar is below the video, and nothing is left above it.
      const stage = player().element.parentElement as HTMLElement;
      expect(stage.compareDocumentPosition(bar as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(host.querySelectorAll('[role="dialog"] > div > *')[0]).toBe(stage);
    });

    it("uses the browser's fullscreen when there is one, and follows it out again", async () => {
      const enter = vi.fn(function (this: HTMLElement) {
        Object.defineProperty(document, "fullscreenElement", { configurable: true, value: this });
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      });
      const leave = vi.fn(() => {
        Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      });
      HTMLElement.prototype.requestFullscreen = enter;
      document.exitFullscreen = leave;
      try {
        await open();

        await youtube(() => button(label("fullscreen"))?.click());
        expect(enter).toHaveBeenCalledTimes(1);
        expect(button(label("exitFullscreen"))).not.toBeNull();

        await youtube(() => button(label("exitFullscreen"))?.click());
        expect(leave).toHaveBeenCalledTimes(1);
        expect(button(label("fullscreen"))).not.toBeNull();

        // Leaving it with the browser's own Escape (no click on our button).
        await youtube(() => button(label("fullscreen"))?.click());
        await youtube(() => void leave());
        expect(button(label("fullscreen"))).not.toBeNull();
        expect(onClose).not.toHaveBeenCalled();
      } finally {
        delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
        delete (document as { exitFullscreen?: unknown }).exitFullscreen;
        Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
      }
    });

    it("falls back to filling the window when the browser refuses fullscreen", async () => {
      HTMLElement.prototype.requestFullscreen = vi.fn(() => Promise.reject(new Error("refused")));
      try {
        await open();

        await youtube(() => button(label("fullscreen"))?.click());

        expect(button(label("exitFullscreen"))).not.toBeNull();
      } finally {
        delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
      }
    });
  });

  it("stops the music when it is closed", async () => {
    await open();
    const started = player();

    await act(async () => root.unmount());

    expect(started.destroyed).toBe(true);
    root = createRoot(host); // so afterEach has something to unmount
  });
});
