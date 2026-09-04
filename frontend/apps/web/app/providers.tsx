"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useHydrateAuthStore } from "@school-ahead/api-client";
import { useHydrateTtsVoiceSettings } from "@/lib/use-hydrate-tts-voice-settings";

// NOTE: run `bun run orval:generate` (with the Django backend up) before
// building/typechecking — this imports the Orval-generated browser client.
// See docs/architecture/06-frontend-architecture.md.

function AuthHydrator({ children }: { children: React.ReactNode }) {
  useHydrateAuthStore();
  return <>{children}</>;
}

function TtsVoiceSettingsHydrator({ children }: { children: React.ReactNode }) {
  useHydrateTtsVoiceSettings();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator>
        <TtsVoiceSettingsHydrator>{children}</TtsVoiceSettingsHydrator>
      </AuthHydrator>
    </QueryClientProvider>
  );
}
