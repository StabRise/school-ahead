// Speaks text using Piper (https://github.com/rhasspy/piper) running fully
// in-browser via WebAssembly. Voices, the ONNX runtime, and the phonemizer
// are all fetched on demand from CDNs by the library itself and cached in
// the browser's Origin Private File System. Shared by the balloon-pop
// minigame, the preschool quiz's "read aloud" button, and the lesson title.
import * as piperTts from "@diffusionstudio/vits-web";
import type { VoiceId } from "@diffusionstudio/vits-web";

export type SpeechLanguage = "en" | "uk" | "pl";

// "short" is for single digits/letters/color words (the balloon-pop game);
// "sentence" is for full phrases (quiz questions/answers, lesson titles).
// They can map to different voices per language — see SENTENCE_VOICE_BY_LANGUAGE.
export type VoiceProfile = "short" | "sentence";

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

const SHORT_VOICE_BY_LANGUAGE: Record<SpeechLanguage, VoiceId> = {
  en: "en_US-lessac-medium",
  uk: "uk_UA-lada-x_low",
  pl: "pl_PL-gosia-medium",
};

// Full sentences need a voice with a fuller phoneme vocabulary. The tiny
// x_low Ukrainian voice above is fine for single digits/letters, but throws
// an ONNX "Gather ... indices element out of data bounds" error on some
// ordinary multi-word sentences it was never trained to cover.
const SENTENCE_VOICE_BY_LANGUAGE: Record<SpeechLanguage, VoiceId> = {
  en: "en_US-lessac-medium",
  uk: "uk_UA-lada-x_low",
  pl: "pl_PL-gosia-medium",
};

function voiceIdFor(language: SpeechLanguage, profile: VoiceProfile): VoiceId {
  return profile === "short" ? SHORT_VOICE_BY_LANGUAGE[language] : SENTENCE_VOICE_BY_LANGUAGE[language];
}

let queuedUtterance: { text: string; language: SpeechLanguage; profile: VoiceProfile } | null = null;
let processingQueue = false;
let currentAudio: HTMLAudioElement | null = null;
// Bumped by speakSequence() so an in-progress sequence (e.g. re-reading a
// quiz question) can tell it's been superseded and stop after the audio
// it already started.
let sequenceToken = 0;

// Prefetches the voice model into OPFS so switching language doesn't stall
// the first utterance on a multi-megabyte download. `download()` always
// re-fetches, so we check `stored()` ourselves first.
export async function prefetchVoice(language: SpeechLanguage, profile: VoiceProfile = "sentence"): Promise<void> {
  try {
    const voiceId = voiceIdFor(language, profile);
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
export function speak(text: string, language: SpeechLanguage, profile: VoiceProfile = "sentence"): void {
  sequenceToken++;
  queuedUtterance = { text, language, profile };
  void drainQueue();
}

// Reads `texts` aloud one after another, waiting for each to finish before
// starting the next — e.g. a quiz question followed by its answer options.
// Calling this again (or speak()) while a sequence is still running cuts it
// off after whatever's currently playing. `onProgress`, if given, is called
// with the index about to start, then with `null` once the sequence ends —
// skipped if a later call has already superseded this one by then.
export async function speakSequence(
  texts: string[],
  language: SpeechLanguage,
  onProgress?: (index: number | null) => void,
  profile: VoiceProfile = "sentence",
): Promise<void> {
  const token = ++sequenceToken;
  currentAudio?.pause();
  try {
    for (let index = 0; index < texts.length; index++) {
      if (token !== sequenceToken) return;
      const text = texts[index];
      if (!text.trim()) continue;
      onProgress?.(index);
      await synthesizeAndPlayToEnd(text, language, profile, token);
    }
  } finally {
    if (token === sequenceToken) onProgress?.(null);
  }
}

async function drainQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (queuedUtterance) {
      const { text, language, profile } = queuedUtterance;
      queuedUtterance = null;
      await synthesizeAndPlay(text, language, profile);
    }
  } finally {
    processingQueue = false;
  }
}

async function synthesizeAndPlay(text: string, language: SpeechLanguage, profile: VoiceProfile): Promise<void> {
  try {
    const wav = await piperTts.predict({ text, voiceId: voiceIdFor(language, profile) });
    currentAudio?.pause();
    const audio = new Audio(URL.createObjectURL(wav));
    currentAudio = audio;
    await audio.play();
  } catch {
    // Best-effort only — never block the caller on TTS failures (offline,
    // unsupported browser, blocked autoplay, ...).
  }
}

async function synthesizeAndPlayToEnd(
  text: string,
  language: SpeechLanguage,
  profile: VoiceProfile,
  token: number,
): Promise<void> {
  try {
    const wav = await piperTts.predict({ text, voiceId: voiceIdFor(language, profile) });
    if (token !== sequenceToken) return;
    const audio = new Audio(URL.createObjectURL(wav));
    currentAudio = audio;
    await audio.play();
    await new Promise<void>((resolve) => audio.addEventListener("ended", () => resolve(), { once: true }));
  } catch {
    // Best-effort only — never block the caller on TTS failures.
  }
}
