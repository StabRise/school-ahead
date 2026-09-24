"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

const MIN_SIDE_PERCENT = 15;
const MIN_CENTER_PERCENT = 25;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Up to three independently scrolling columns — an optional side panel on
// the left (the video subtitles), the lesson content in the middle, and an
// optional side panel on the right (the конспект) — with a draggable
// divider next to each side panel that's shown. Used by the student wizard's
// "Теорія" tab (lesson-wizard.tsx) and the tutor's Lesson detail page
// (tutor/tutor-lesson-detail-page.tsx). No split-pane library exists
// anywhere in this repo, and none is warranted for two dividers — they're
// hand-rolled via pointer capture, the same technique @school-ahead/avatar's
// avatar-preview.tsx's own drag-resize handle uses.
export function LessonPanels({
  left,
  center,
  right,
}: {
  left?: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(28);
  const [rightPercent, setRightPercent] = useState(35);
  const leftWidth = left ? leftPercent : 0;
  const rightWidth = right ? rightPercent : 0;

  // The pointer's x position as a percentage of the container's width.
  const pointerPercent = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return ((clientX - rect.left) / rect.width) * 100;
  };

  return (
    <div ref={containerRef} className="flex h-[70vh] w-full">
      {left && (
        <>
          <div className="overflow-y-auto pr-3" style={{ width: `${leftWidth}%` }}>
            {left}
          </div>
          <PanelDivider
            onDrag={(clientX) => {
              const percent = pointerPercent(clientX);
              if (percent === null) return;
              setLeftPercent(clamp(percent, MIN_SIDE_PERCENT, 100 - rightWidth - MIN_CENTER_PERCENT));
            }}
          />
        </>
      )}

      <div className="overflow-y-auto px-3" style={{ width: `${100 - leftWidth - rightWidth}%` }}>
        {center}
      </div>

      {right && (
        <>
          <PanelDivider
            onDrag={(clientX) => {
              const percent = pointerPercent(clientX);
              if (percent === null) return;
              setRightPercent(clamp(100 - percent, MIN_SIDE_PERCENT, 100 - leftWidth - MIN_CENTER_PERCENT));
            }}
          />
          <div className="overflow-y-auto pl-3" style={{ width: `${rightWidth}%` }}>
            {right}
          </div>
        </>
      )}
    </div>
  );
}

function PanelDivider({ onDrag }: { onDrag: (clientX: number) => void }) {
  const t = useTranslations("LessonWizard");

  return (
    <div
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onDrag(e.clientX);
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("synopsisResizeHandleLabel")}
      className="w-1.5 shrink-0 cursor-col-resize touch-none rounded bg-gray-200 hover:bg-gray-300 active:bg-gray-400"
    />
  );
}
