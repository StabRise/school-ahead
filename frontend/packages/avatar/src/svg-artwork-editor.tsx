"use client";

import { useEffect, useRef, useState } from "react";

// The svgedit npm package (https://github.com/SVG-Edit/svgedit) ships a
// fully self-contained dist bundle (dist/editor/Editor.js + its own CSS,
// icon images, and toolbar extensions) meant to be *served as static
// files* and loaded by the browser directly — its relative asset paths
// (icons, extensions) are resolved against wherever Editor.js itself is
// served from, not against whatever page embeds it. That's incompatible
// with importing it straight through Next.js's bundler (its 5MB dist would
// get pulled into our own build, and its relative asset URLs would resolve
// against our route's URL instead of its own). apps/web/public/svgedit/ —
// generated at predev/prebuild time by
// apps/web/scripts/copy-svgedit-assets.mjs from the installed svgedit
// package, not committed — plus a plain browser-native dynamic `import()`
// of that public URL, same approach as embedding any other bundled
// third-party widget, sidesteps both problems.
const SVGEDIT_BASE_PATH = "/svgedit";

// How long to wait for each phase before assuming it's stuck rather than
// just slow — surfaced on-page (see `status`/`stuck` below) since a hang
// inside svgedit's own init() (an unresolved internal await, as opposed to
// a thrown/rejected error, which the try/catch below already surfaces)
// would otherwise leave the container silently blank forever with nothing
// in the console to explain why.
const STUCK_TIMEOUT_MS = 10_000;

// Minimal slice of svgedit's actual Editor/SvgCanvas API this wrapper
// relies on (verified against node_modules/svgedit's own
// packages/svgcanvas/svgcanvas.d.ts and src/editor/Editor.js — not just its
// README): `new Editor(container)`, `.setConfig({...})`, `async .init()`,
// `.loadFromString(str)` (the public, ready-queue-aware wrapper around the
// internal loadSvgString — safe to call the instant init() resolves), and
// `.svgCanvas.getSvgString(): string`.
interface SvgEditEditor {
  setConfig: (config: Record<string, unknown>) => void;
  init: () => Promise<void>;
  loadFromString: (svg: string, opts?: { noAlert?: boolean }) => Promise<void>;
  svgCanvas: { getSvgString: () => string };
}

export interface SvgArtworkEditorHandle {
  loadSvgString: (svg: string) => void;
  getSvgString: () => string;
}

// Thin React wrapper around svgedit's imperative Editor class — mounts it
// into a plain ref'd div (svgedit requires a container with fixed numeric
// pixel dimensions, not "auto") and hands the caller a small load/export
// handle via `onReady` once initialized, so the host page can seed the
// starting artwork and read back the edited result on Save without needing
// to know anything about svgedit's own API surface.
export function SvgArtworkEditor({
  onReady,
  width = 900,
  height = 620,
}: {
  onReady: (handle: SvgArtworkEditorHandle) => void;
  width?: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Avoids a double-mount (React 18/19 StrictMode dev double-invoke) from
  // spinning up two Editor instances in the same container. Reset in the
  // effect's own cleanup (below) rather than left permanently `true` —
  // StrictMode's mount→cleanup→mount happens synchronously, before the
  // async import below resolves, so the *first* (throwaway) run is always
  // the one that gets cancelled while still awaiting; the *second* (real)
  // run is the one that must actually proceed. Leaving this `true` forever
  // makes that second run's effect body a no-op, silently stranding the
  // status text on its initial value forever with no error.
  const initializedRef = useRef(false);
  // Surfaced visibly rather than left as a silently-blank container — a
  // failure here (the import rejecting, init() throwing) previously just
  // left an empty box with no on-page indication anything had gone wrong.
  const [error, setError] = useState<string | null>(null);
  // Which phase we're in right now — shown on-page so a hang (init() never
  // resolving or rejecting, e.g. stuck on an internal fetch) is visible as
  // "still on step X after Ns" instead of just a silently blank box.
  const [status, setStatus] = useState("importing svgedit module…");
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;
    let cancelled = false;

    const stuckTimer = setTimeout(() => {
      if (!cancelled) setStuck(true);
    }, STUCK_TIMEOUT_MS);

    (async () => {
      try {
        // A non-literal specifier plus the webpackIgnore magic comment:
        // this must stay a plain browser dynamic import of a public URL,
        // never something the bundler tries to resolve/inline at build
        // time (see the module doc comment above for why).
        const editorModuleUrl = `${SVGEDIT_BASE_PATH}/Editor.js`;
        const { default: Editor } = await import(/* webpackIgnore: true */ editorModuleUrl);
        if (cancelled || !containerRef.current) return;
        setStatus("constructing editor…");

        const editor: SvgEditEditor = new Editor(containerRef.current);
        editor.setConfig({
          // Absolute, not the library's own relative defaults ("./images",
          // "./extensions/") — those resolve against the *page's* URL, not
          // Editor.js's, once loaded this way (see the doc comment above).
          imgPath: `${SVGEDIT_BASE_PATH}/images/`,
          extPath: `${SVGEDIT_BASE_PATH}/extensions/`,
          dimensions: [width, height],
        });
        setStatus("running editor.init() (locale + component setup)…");
        await editor.init();
        if (cancelled) return;
        clearTimeout(stuckTimer);
        setStatus("ready");

        onReady({
          loadSvgString: (svg) => {
            editor.loadFromString(svg, { noAlert: true }).catch((e) => setError(String(e)));
          },
          getSvgString: () => editor.svgCanvas.getSvgString(),
        });
      } catch (e) {
        clearTimeout(stuckTimer);
        if (!cancelled) setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      }
    })();

    return () => {
      cancelled = true;
      initializedRef.current = false;
      clearTimeout(stuckTimer);
    };
    // Mount-once by design (see initializedRef) — onReady/width/height are
    // only ever read at that one initialization, same convention as
    // avatar-placement-editor.tsx's mount-once layer seeding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href={`${SVGEDIT_BASE_PATH}/svgedit.css`} />
      {!error && status !== "ready" && (
        <p className="max-w-2xl text-xs text-gray-500" style={{ width }}>
          {status}
          {stuck && ` — still stuck on this step after ${STUCK_TIMEOUT_MS / 1000}s (not erroring, just never resolving)`}
        </p>
      )}
      {error && (
        <p className="max-w-2xl whitespace-pre-wrap text-xs text-red-600" style={{ width }}>
          {error}
        </p>
      )}
      <div ref={containerRef} style={{ width, height }} />
    </>
  );
}
