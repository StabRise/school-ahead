import { create } from "zustand";

// Admin-configured Piper voice per (language, profile), from GET
// /api/tts/voices (see backend tts.models.TtsVoiceSetting). Hydrated once by
// useHydrateTtsVoiceSettings; lib/piper-tts.ts reads it outside React via
// useTtsVoiceSettingsStore.getState() and falls back to its own hardcoded
// defaults for any pair missing here (e.g. before hydration resolves, or if
// the fetch fails).
interface TtsVoiceSettingsState {
  // Keyed by `${language}:${profile}`, e.g. "uk:short" -> "uk_UA-mykyta-high".
  overrides: Record<string, string>;
  setOverrides: (rows: { language: string; profile: string; voice_id: string }[]) => void;
}

export const useTtsVoiceSettingsStore = create<TtsVoiceSettingsState>((set) => ({
  overrides: {},
  setOverrides: (rows) =>
    set({ overrides: Object.fromEntries(rows.map((row) => [`${row.language}:${row.profile}`, row.voice_id])) }),
}));
