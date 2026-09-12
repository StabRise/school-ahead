#!/usr/bin/env node
// Copies the parts of the `svgedit` npm package's own dist bundle that
// @school-ahead/avatar's SvgArtworkEditor loads as plain static files
// (not through Next.js's bundler — see that component's own doc comment
// for why) into public/svgedit/. Runs automatically before `dev`/`build`
// (see package.json's predev/prebuild) so this never has to be committed
// to the repo or manually kept in sync with the installed svgedit version —
// same "generate, don't commit" convention as
// packages/api-client/scripts/generate-piper-voices.mjs.
//
// Run with: bun run svgedit-assets:copy

import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// svgedit's package.json "main" points at dist/editor/Editor.js — resolve
// through that rather than hardcoding a node_modules path, so this keeps
// working regardless of how the workspace happens to hoist/nest it.
const editorEntry = require.resolve("svgedit");
const distEditorDir = path.dirname(editorEntry);
const packageRoot = path.dirname(require.resolve("svgedit/package.json"));

const OUTPUT_DIR = new URL("../public/svgedit/", import.meta.url).pathname;

// Only what SvgArtworkEditor actually references (imgPath/extPath config,
// the stylesheet, the entry module itself, and its sourcemap so a real
// error in the bundle maps back to readable source in devtools instead of
// pointing at minified code) — not the demo HTML pages, tests, or iife
// build variant also present in dist/editor/.
const DIST_ENTRIES = ["Editor.js", "Editor.js.map", "svgedit.css", "images", "extensions", "components"];

await rm(OUTPUT_DIR, { recursive: true, force: true });
for (const entry of DIST_ENTRIES) {
  const source = path.join(distEditorDir, entry);
  if (!existsSync(source)) throw new Error(`Expected svgedit dist entry not found: ${source}`);
  await cp(source, path.join(OUTPUT_DIR, entry), { recursive: true });
}

// The published dist/editor/ build doesn't include the locale files at
// all — Editor.js's putLocale() does a runtime `import('./locale/lang.
// <code>.js')` relative to itself regardless, which 404s for every
// language (not just non-English ones) and leaves init() hanging forever
// (it's an unguarded top-level await, so nothing else in init() — the DOM
// template injection included — ever runs, and nothing throws either).
// The plain-object files under the package's own src/editor/locale/ are
// already valid, dependency-free ES modules (`export default {...}`, no
// build step needed), so copy those straight across as the missing
// dist/editor/locale/.
const localeSource = path.join(packageRoot, "src/editor/locale");
if (!existsSync(localeSource)) throw new Error(`Expected svgedit locale source not found: ${localeSource}`);
await cp(localeSource, path.join(OUTPUT_DIR, "locale"), { recursive: true });

console.log(`Copied svgedit dist assets (${DIST_ENTRIES.join(", ")}, locale) to public/svgedit/`);
