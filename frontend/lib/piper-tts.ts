// Speaks text using Piper (https://github.com/rhasspy/piper) running fully
// in-browser via WebAssembly. Voices, the ONNX runtime, and the phonemizer
// are all fetched on demand from CDNs by the library itself and cached in
// the browser's Origin Private File System. Shared by the balloon-pop
// minigame, the preschool quiz's "read aloud" button, and the lesson title.
import * as piperTts from "@diffusionstudio/vits-web";
import { HF_BASE, PATH_MAP } from "@diffusionstudio/vits-web";
import type { VoiceId } from "@diffusionstudio/vits-web";
import { PIPER_VOICE_PATHS } from "./piper-voices.generated";
import type { PiperVoiceId } from "./piper-voices.generated";
import { useTtsVoiceSettingsStore } from "@/stores/tts-voice-settings-store";

export type SpeechLanguage = "en" | "uk" | "pl";

// @diffusionstudio/vits-web (last published 1.0.3) hardcodes both its VoiceId
// union and the model paths it knows about (PATH_MAP), and fetches them from
// its own mirror (HF_BASE, huggingface.co/diffusionstudio/piper-voices) —
// which lags the upstream rhasspy/piper-voices repo it's mirroring (111
// voices vs. rhasspy's 175, e.g. missing uk_UA-mykyta-high entirely). To use
// vits-web's inference/caching machinery with the full, current voice list
// instead, piper-voices.generated.ts (see generate-piper-voices.mjs) is
// generated straight from rhasspy's manifest, and used here in place of
// vits-web's VoiceId/PATH_MAP wherever a voice is looked up.
type AnyVoiceId = VoiceId | PiperVoiceId;
const UPSTREAM_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

// vits-web's predict()/download()/stored() all key off PATH_MAP and fetch
// straight from HF_BASE with no way to override either from the outside, so
// using rhasspy's full voice list means both patching the (mutable,
// exported) PATH_MAP object with rhasspy's paths and rewriting HF_BASE
// requests to rhasspy — safe to do unconditionally since every voice
// vits-web ships also exists at rhasspy under the same relative path
// (verified when piper-voices.generated.ts was written).
let voicesRegistered = false;
function ensureVoicesRegistered(): void {
  if (voicesRegistered || typeof window === "undefined") return;
  voicesRegistered = true;
  Object.assign(PATH_MAP, PIPER_VOICE_PATHS);
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(HF_BASE)) return originalFetch(UPSTREAM_HF_BASE + url.slice(HF_BASE.length), init);
    return originalFetch(input, init);
  };
}

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

// Used only as a fallback — see voiceIdFor() below — for any (language,
// profile) pair the backend has no TtsVoiceSetting row for yet (a fresh DB
// before the seed migration runs, or a language added here before an admin
// configures it). The admin-configured value is what's actually used day to
// day; keep these in sync with tts/migrations/0002_seed_default_voices.py's
// seed data so a missing row falls back to the same voice it'd otherwise
// default to.
const SHORT_VOICE_BY_LANGUAGE: Record<SpeechLanguage, AnyVoiceId> = {
  en: "en_US-lessac-medium",
  uk: "uk_UA-mykyta-high",
  pl: "pl_PL-gosia-medium",
};

// Full sentences need a voice with a fuller phoneme vocabulary than a tiny
// x_low/low-quality model offers — those throw an ONNX "Gather ... indices
// element out of data bounds" error on ordinary multi-word sentences they
// were never trained to cover. Currently identical to SHORT_VOICE_BY_LANGUAGE
// for every language, but kept separate since a language may need a lighter
// voice for short utterances and a fuller one for sentences again later.
const SENTENCE_VOICE_BY_LANGUAGE: Record<SpeechLanguage, AnyVoiceId> = {
  en: "en_US-lessac-medium",
  uk: "uk_UA-mykyta-high",
  pl: "pl_PL-gosia-medium",
};

// Admin-configured voice (System admin > Tts voice settings) takes priority
// over the hardcoded defaults above — see
// stores/tts-voice-settings-store.ts. Read via getState() rather than the
// useTtsVoiceSettingsStore() hook since this runs from plain functions
// (speak(), warmupSpeech(), ...), not React components.
function voiceIdFor(language: SpeechLanguage, profile: VoiceProfile): AnyVoiceId {
  const override = useTtsVoiceSettingsStore.getState().overrides[`${language}:${profile}`];
  if (override) return override as AnyVoiceId;
  return profile === "short" ? SHORT_VOICE_BY_LANGUAGE[language] : SENTENCE_VOICE_BY_LANGUAGE[language];
}

let queuedUtterance: { text: string; language: SpeechLanguage; profile: VoiceProfile } | null = null;
let processingQueue = false;
// Bumped by speakSequence() so an in-progress sequence (e.g. re-reading a
// quiz question) can tell it's been superseded and stop after the audio
// it already started.
let sequenceToken = 0;

// A single, reused <audio> element for every utterance instead of a fresh
// `new Audio()` per call. Browsers (Safari/iOS in particular) only allow
// HTMLMediaElement.play() to run without a *fresh* user gesture on an
// element that has already been played once as part of some gesture — a
// brand-new element created later (e.g. from a useEffect firing on mount
// or after a setTimeout, not a click) gets silently blocked, which is why
// a manual "read aloud" button worked while auto-reading a freshly shown
// quiz question did not. Reusing one element means it gets unlocked the
// first time *any* click-triggered speak() plays it (a balloon pop, a
// read-aloud button, ...), and every later programmatic play rides on
// that same unlocked element instead of starting from zero.
let sharedAudio: HTMLAudioElement | null = null;
let sharedAudioObjectUrl: string | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

// Swaps the shared element's source and plays it, releasing the previous
// utterance's object URL once it's no longer needed.
function playOnSharedAudio(wav: Blob): Promise<void> {
  const audio = getSharedAudio();
  const url = URL.createObjectURL(wav);
  const previousUrl = sharedAudioObjectUrl;
  sharedAudioObjectUrl = url;
  audio.pause();
  audio.src = url;
  audio.currentTime = 0;
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  return audio.play();
}

// piper-tts's predict() re-creates a full onnxruntime-web InferenceSession
// from the model bytes on every call — expensive (hundreds of ms+) even
// once the model itself is cached in OPFS. Short, high-repeat utterances
// (digits, letters, color names) benefit hugely from caching the resulting
// WAV per (voiceId, text) instead of re-synthesizing every time.
//
// Two layers: an in-memory Map (dedupes concurrent/rapid calls within a tab)
// backed by the CacheStorage API (survives page reloads — otherwise every
// fresh page load pays the full warmup latency again, since the in-memory
// map alone resets on every load).
const synthesisCache = new Map<string, Promise<Blob>>();
const AUDIO_CACHE_NAME = "piper-tts-audio-v1";

// CacheStorage keys audio by (voiceId, text), not (language, profile, text)
// — voiceId is what actually determines the audio, and keying on it means a
// future change to the language→voice mapping naturally stops reusing
// stale audio from a since-replaced voice instead of silently serving it.
function audioCacheUrl(voiceId: AnyVoiceId, text: string): string {
  return `${location.origin}/__piper-tts-cache__/${encodeURIComponent(voiceId)}/${encodeURIComponent(text)}`;
}

async function getPersistedAudio(voiceId: AnyVoiceId, text: string): Promise<Blob | undefined> {
  if (typeof caches === "undefined") return undefined;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const match = await cache.match(audioCacheUrl(voiceId, text));
    return await match?.blob();
  } catch {
    return undefined;
  }
}

async function persistAudio(voiceId: AnyVoiceId, text: string, wav: Blob): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.put(audioCacheUrl(voiceId, text), new Response(wav, { headers: { "Content-Type": "audio/x-wav" } }));
  } catch {
    // Best-effort only — private browsing, storage quota, unsupported browser, ...
  }
}

function getOrSynthesize(text: string, language: SpeechLanguage, profile: VoiceProfile): Promise<Blob> {
  const voiceId = voiceIdFor(language, profile);
  const key = `${voiceId}:${text}`;
  let cached = synthesisCache.get(key);
  if (!cached) {
    cached = (async () => {
      const persisted = await getPersistedAudio(voiceId, text);
      if (persisted) return persisted;
      ensureVoicesRegistered();
      const wav = await piperTts.predict({ text, voiceId: voiceId as VoiceId });
      void persistAudio(voiceId, text, wav);
      return wav;
    })();
    synthesisCache.set(key, cached);
    // Don't poison the cache with a failed synthesis — let the next call retry.
    cached.catch(() => synthesisCache.delete(key));
  }
  return cached;
}

// Chains background synthesis so warmup calls run one at a time instead of
// racing several InferenceSession creations at once.
let warmupQueue: Promise<void> = Promise.resolve();

// Pre-synthesizes `texts` in the background so they're already cached by
// the time they're actually spoken (e.g. every number/letter/color a game
// mode can produce). Safe to call repeatedly — already-cached or
// already-queued texts are cheap no-ops.
export function warmupSpeech(texts: string[], language: SpeechLanguage, profile: VoiceProfile = "short"): void {
  for (const text of texts) {
    warmupQueue = warmupQueue.then(() => getOrSynthesize(text, language, profile).then(() => undefined, () => undefined));
  }
}

// Prefetches the voice model into OPFS so switching language doesn't stall
// the first utterance on a multi-megabyte download. `download()` always
// re-fetches, so we check `stored()` ourselves first.
export async function prefetchVoice(language: SpeechLanguage, profile: VoiceProfile = "sentence"): Promise<void> {
  try {
    const voiceId = voiceIdFor(language, profile);
    ensureVoicesRegistered();
    const alreadyStored = await piperTts.stored();
    if (alreadyStored.includes(voiceId as VoiceId)) return;
    await piperTts.download(voiceId as VoiceId);
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
  sharedAudio?.pause();
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
    const wav = await getOrSynthesize(text, language, profile);
    await playOnSharedAudio(wav);
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
    const wav = await getOrSynthesize(text, language, profile);
    if (token !== sequenceToken) return;
    const audio = getSharedAudio();
    await playOnSharedAudio(wav);
    await new Promise<void>((resolve) => audio.addEventListener("ended", () => resolve(), { once: true }));
  } catch {
    // Best-effort only — never block the caller on TTS failures.
  }
}
