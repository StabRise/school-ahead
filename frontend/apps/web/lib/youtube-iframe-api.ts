// A minimal, hand-written slice of the YouTube IFrame Player API
// (https://developers.google.com/youtube/iframe_api_reference) — only what the
// subject player uses, so there is no dependency to add. The API is a script
// that puts `YT` on `window` and calls `onYouTubeIframeAPIReady` once loaded.
export interface YouTubePlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

export interface YouTubePlayerEvent {
  // A player state (YouTubeNamespace.PlayerState) for onStateChange, an error
  // code for onError.
  data: number;
}

export interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YouTubePlayerEvent) => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
        onError?: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

// Loads the IFrame API once and resolves with `YT`. Asking again — from any
// number of players, before or after it has loaded — reuses the one script. A
// failed load (offline, blocked) can be retried by asking again.
export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("YouTube API needs a browser"));
  if (window.YT?.Player) return Promise.resolve(window.YT);

  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT as YouTubeNamespace);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("Could not load the YouTube player"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}
