"use client";

import { useEffect } from "react";
import { useListTtsVoices } from "@school-ahead/api-client/browser/tts/tts";
import { useTtsVoiceSettingsStore } from "@school-ahead/api-client";

// Hydrates useTtsVoiceSettingsStore from GET /api/tts/voices on load, so
// lib/piper-tts.ts can use the admin-configured voice for each
// language/profile instead of falling back to its hardcoded defaults. A
// fetch failure (offline, unauthenticated) just leaves the store empty —
// piper-tts.ts's hardcoded defaults are the fallback, not an error state.
export function useHydrateTtsVoiceSettings() {
  const setOverrides = useTtsVoiceSettingsStore((state) => state.setOverrides);
  const { data } = useListTtsVoices();

  useEffect(() => {
    if (data) setOverrides(data);
  }, [data, setOverrides]);
}
