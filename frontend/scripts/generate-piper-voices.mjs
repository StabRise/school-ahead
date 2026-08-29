#!/usr/bin/env node
// Regenerates lib/piper-voices.generated.ts from the voice manifest at
// https://huggingface.co/rhasspy/piper-voices — the upstream source Piper
// models are actually published to. @diffusionstudio/vits-web (the library
// piper-tts.ts uses to run these models in-browser) bundles its own,
// infrequently-updated snapshot of that manifest, so new voices (e.g.
// uk_UA-mykyta-high) can be missing from it for a long time. This script
// lets piper-tts.ts use the full, current voice list instead.
//
// Run with: bun run piper-voices:generate

const VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json";
const OUTPUT_PATH = new URL("../lib/piper-voices.generated.ts", import.meta.url);

const response = await fetch(VOICES_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch ${VOICES_URL}: ${response.status} ${response.statusText}`);
}
const voices = await response.json();

const pathByVoiceId = {};
for (const [voiceId, voice] of Object.entries(voices)) {
  const onnxPath = Object.keys(voice.files).find((path) => path.endsWith(".onnx") && !path.endsWith(".onnx.json"));
  if (!onnxPath) throw new Error(`Voice ${voiceId} has no .onnx file in its manifest entry`);
  pathByVoiceId[voiceId] = onnxPath;
}

const voiceIds = Object.keys(pathByVoiceId).sort();

const body = `// GENERATED FILE — do not edit by hand.
// Regenerate with: bun run piper-voices:generate
// (frontend/scripts/generate-piper-voices.mjs, sourced from
// https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json)
// Generated: ${new Date().toISOString().slice(0, 10)}

// Every voice id published upstream at rhasspy/piper-voices as of the
// generation date above.
export type PiperVoiceId =
${voiceIds.map((id) => `  | "${id}"`).join("\n")};

// voiceId -> path of its .onnx model file, relative to
// https://huggingface.co/rhasspy/piper-voices/resolve/main/
export const PIPER_VOICE_PATHS: Record<PiperVoiceId, string> = {
${voiceIds.map((id) => `  "${id}": "${pathByVoiceId[id]}",`).join("\n")}
};
`;

await import("node:fs/promises").then((fs) => fs.writeFile(OUTPUT_PATH, body));
console.log(`Wrote ${voiceIds.length} voices to ${OUTPUT_PATH.pathname}`);
