import { speak, type SpeechLanguage } from "@school-ahead/api-client";

// Speaks a flashcard's term aloud (docs/preschool/games/cards.md) — a real
// recording (FlashcardItem.sound, resolved via flashcardSoundUrl) if the
// card has one and it actually loads, otherwise Piper TTS. A single reused
// `<audio>` element rather than `new Audio()` per call, same reasoning as
// piper-tts.ts's own sharedAudio: Safari/iOS only reliably lets
// HTMLMediaElement.play() run without a fresh gesture on an element already
// unlocked by an earlier click-triggered play.
let sharedAudio: HTMLAudioElement | null = null;
// Bumped on every call so a stale `error` handler from a since-replaced
// card's audio (e.g. rapid ←/→ navigation) can tell it's been superseded
// and skip its TTS fallback instead of speaking the wrong card's term.
let playToken = 0;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

export function playCardTerm(term: string, soundUrl: string | null, language: SpeechLanguage): void {
  const token = ++playToken;

  if (!soundUrl) {
    speak(term, language, "sentence");
    return;
  }

  const audio = getSharedAudio();
  // A missing file (404) fails asynchronously via the element's `error`
  // event, not via a rejected play() — that rejection alone only signals a
  // blocked-autoplay attempt, so it isn't a reliable "fall back to TTS"
  // trigger.
  audio.onerror = () => {
    if (token !== playToken) return;
    speak(term, language, "sentence");
  };
  audio.pause();
  audio.src = soundUrl;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Best-effort only — autoplay blocked, unsupported browser, etc.
  });
}
