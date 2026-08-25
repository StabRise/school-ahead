// Speaks text using Piper (https://github.com/rhasspy/piper) running fully
// in-browser via WebAssembly. Voices, the ONNX runtime, and the phonemizer
// are all fetched on demand from CDNs by the library itself and cached in
// the browser's Origin Private File System. Shared by the balloon-pop
// minigame and the preschool quiz's "read aloud" button.
import * as piperTts from "@diffusionstudio/vits-web";
import type { VoiceId } from "@diffusionstudio/vits-web";

export type SpeechLanguage = "en" | "uk" | "pl";

// Tutor-authored quiz prompts/choices are Markdown (see QuizQuestion.prompt,
// QuizChoice.text) — strip the syntax before handing text to the TTS engine
// so it doesn't read out asterisks, brackets, etc.
export function toSpeechText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1") // links -> link text
    .replace(/<[^>]+>/g, "") // raw HTML tags
    .replace(/^#{1,6}\s+/gm, "") // headers
    .replace(/^>\s?/gm, "") // blockquotes
    .replace(/^\s*[-*+]\s+/gm, "") // bullet list markers
    .replace(/^\s*\d+[.)]\s+/gm, "") // numbered list markers
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // inline/fenced code
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/\s+/g, " ")
    .trim();
}

const VOICE_BY_LANGUAGE: Record<SpeechLanguage, VoiceId> = {
  en: "en_US-lessac-medium",
  uk: "uk_UA-lada-x_low",
  pl: "pl_PL-gosia-medium",
};

let queuedUtterance: { text: string; language: SpeechLanguage } | null = null;
let processingQueue = false;
let currentAudio: HTMLAudioElement | null = null;
// Bumped by speakSequence() so an in-progress sequence (e.g. re-reading a
// quiz question) can tell it's been superseded and stop after the audio
// it already started.
let sequenceToken = 0;

// Prefetches the voice model into OPFS so switching language doesn't stall
// the first utterance on a multi-megabyte download. `download()` always
// re-fetches, so we check `stored()` ourselves first.
export async function prefetchVoice(language: SpeechLanguage): Promise<void> {
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
export function speak(text: string, language: SpeechLanguage): void {
  sequenceToken++;
  queuedUtterance = { text, language };
  void drainQueue();
}

// Reads `texts` aloud one after another, waiting for each to finish before
// starting the next — e.g. a quiz question followed by its answer options.
// Calling this again (or speak()) while a sequence is still running cuts it
// off after whatever's currently playing.
export async function speakSequence(texts: string[], language: SpeechLanguage): Promise<void> {
  const token = ++sequenceToken;
  currentAudio?.pause();
  for (const text of texts) {
    if (token !== sequenceToken) return;
    if (!text.trim()) continue;
    await synthesizeAndPlayToEnd(text, language, token);
  }
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

async function synthesizeAndPlay(text: string, language: SpeechLanguage): Promise<void> {
  try {
    const wav = await piperTts.predict({ text, voiceId: VOICE_BY_LANGUAGE[language] });
    currentAudio?.pause();
    const audio = new Audio(URL.createObjectURL(wav));
    currentAudio = audio;
    await audio.play();
  } catch {
    // Best-effort only — never block the caller on TTS failures (offline,
    // unsupported browser, blocked autoplay, ...).
  }
}

async function synthesizeAndPlayToEnd(text: string, language: SpeechLanguage, token: number): Promise<void> {
  try {
    const wav = await piperTts.predict({ text, voiceId: VOICE_BY_LANGUAGE[language] });
    if (token !== sequenceToken) return;
    const audio = new Audio(URL.createObjectURL(wav));
    currentAudio = audio;
    await audio.play();
    await new Promise<void>((resolve) => audio.addEventListener("ended", () => resolve(), { once: true }));
  } catch {
    // Best-effort only — never block the caller on TTS failures.
  }
}
