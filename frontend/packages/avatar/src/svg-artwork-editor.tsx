"use client";

import { useEffect, useRef } from "react";

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

// Minimal slice of svgedit's actual Editor/SvgCanvas API this wrapper
// relies on (verified against node_modules/svgedit's own
// packages/svgcanvas/svgcanvas.d.ts and src/editor/Editor.js — not just its
// README): `new Editor(container)`, `.setConfig({...})`, `async .init()`,
// `.loadSvgString(str)`, and `.svgCanvas.getSvgString(): string`.
interface SvgEditEditor {
  setConfig: (config: Record<string, unknown>) => void;
  init: () => Promise<void>;
  loadSvgString: (svg: string, opts?: { noAlert?: boolean }) => void;
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
  // spinning up two Editor instances in the same container.
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;
    let cancelled = false;

    (async () => {
      // A non-literal specifier plus the webpackIgnore magic comment: this
      // must stay a plain browser dynamic import of a public URL, never
      // something the bundler tries to resolve/inline at build time (see
      // the module doc comment above for why).
      const editorModuleUrl = `${SVGEDIT_BASE_PATH}/Editor.js`;
      const { default: Editor } = await import(/* webpackIgnore: true */ editorModuleUrl);
      if (cancelled || !containerRef.current) return;

      const editor: SvgEditEditor = new Editor(containerRef.current);
      editor.setConfig({
        // Absolute, not the library's own relative defaults ("./images",
        // "./extensions/") — those resolve against the *page's* URL, not
        // Editor.js's, once loaded this way (see the doc comment above).
        imgPath: `${SVGEDIT_BASE_PATH}/images/`,
        extPath: `${SVGEDIT_BASE_PATH}/extensions/`,
        dimensions: [width, height],
      });
      await editor.init();
      if (cancelled) return;

      onReady({
        loadSvgString: (svg) => editor.loadSvgString(svg, { noAlert: true }),
        getSvgString: () => editor.svgCanvas.getSvgString(),
      });
    })();

    return () => {
      cancelled = true;
    };
    // Mount-once by design (see initializedRef) — onReady/width/height are
    // only ever read at that one initialization, same convention as
    // avatar-placement-editor.tsx's mount-once layer seeding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href={`${SVGEDIT_BASE_PATH}/svgedit.css`} />
      <div ref={containerRef} style={{ width, height }} />
    </>
  );
}
