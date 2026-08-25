// Speaks a popped balloon's label using Piper (https://github.com/rhasspy/piper)
// running fully in-browser via WebAssembly. Voices, the ONNX runtime, and the
// phonemizer are all fetched on demand from CDNs by the library itself and
// cached in the browser's Origin Private File System.
import * as piperTts from "@diffusionstudio/vits-web";
import type { VoiceId } from "@diffusionstudio/vits-web";

export type GameLanguage = "en" | "uk" | "pl";

const VOICE_BY_LANGUAGE: Record<GameLanguage, VoiceId> = {
  en: "en_US-lessac-medium",
  uk: "uk_UA-lada-x_low",
  pl: "pl_PL-gosia-medium",
};

let queuedUtterance: { text: string; language: GameLanguage } | null = null;
let processingQueue = false;
let currentAudio: HTMLAudioElement | null = null;

// Prefetches the voice model into OPFS so switching language doesn't stall
// the first spoken balloon on a multi-megabyte download. `download()` always
// re-fetches, so we check `stored()` ourselves first.
export async function prefetchVoice(language: GameLanguage): Promise<void> {
  try {
    const voiceId = VOICE_BY_LANGUAGE[language];
    const alreadyStored = await piperTts.stored();
    if (alreadyStored.includes(voiceId)) return;
    await piperTts.download(voiceId);
  } catch {
    // Best-effort only — offline or unsupported browsers just skip prefetching.
  }
}

// Speaks `text` using the voice for `language`. Calls made while a previous
// synthesis is still running replace the queued utterance instead of piling
// up, so rapidly popping balloons only ever speaks the latest one.
export function speakBalloonLabel(text: string, language: GameLanguage): void {
  queuedUtterance = { text, language };
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (queuedUtterance) {
      const { text, language } = queuedUtterance;
      queuedUtterance = null;
      await synthesizeAndPlay(text, language);
    }
  } finally {
    processingQueue = false;
  }
}

async function synthesizeAndPlay(text: string, language: GameLanguage): Promise<void> {
  try {
    const wav = await piperTts.predict({ text, voiceId: VOICE_BY_LANGUAGE[language] });
    currentAudio?.pause();
    const audio = new Audio(URL.createObjectURL(wav));
    currentAudio = audio;
    await audio.play();
  } catch {
    // Best-effort only — never block the game on TTS failures (offline,
    // unsupported browser, blocked autoplay, ...).
  }
}
