"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/card";
import { ReadAlongContent } from "@/components/read-along-content";
import { ReadAlongControlPanel } from "@/components/read-along-control-panel";
import { AnnotationCanvas } from "./annotation-canvas";
import { MaterialAnnotationPanel } from "./material-annotation-panel";
import { useReadAlongPlayer } from "@/lib/use-read-along-player";
import { readingBlocksFromMaterialBlocks } from "@/lib/reading-blocks";
import type { DrawTool } from "@/lib/material-annotations";
import type { SpeechLanguage } from "@/lib/piper-tts";
import {
  getListAnnotationsQueryKey,
  useAddAnnotation,
  useListAnnotations,
} from "@/lib/api/browser/student-lessons/student-lessons";
import type { StudentLessonMaterialOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// One material's full playback + annotation view — reuses the exact same
// ReadAlongContent/ReadAlongControlPanel/useReadAlongPlayer trio as
// components/read-along-page.tsx, loaded from a saved StudentLessonMaterial
// instead of freshly pasted text/a link, plus a drawing canvas overlay and
// a right-side panel for highlights/comments (see backend/lessons/models.py's
// MaterialAnnotation — everything drawn/highlighted/commented here persists
// and reloads on the student's next visit).
function MaterialDetail({ material, onBack }: { material: StudentLessonMaterialOut; onBack?: () => void }) {
  const t = useTranslations("MaterialsStep");
  const tReadAlong = useTranslations("ReadAlong");
  const player = useReadAlongPlayer(true);
  const loadedMaterialId = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [drawMode, setDrawMode] = useState(false);
  const [tool, setTool] = useState<DrawTool>("rectangle");

  useEffect(() => {
    if (loadedMaterialId.current === material.id) return;
    loadedMaterialId.current = material.id;
    player.load(
      readingBlocksFromMaterialBlocks(material.content),
      material.language as SpeechLanguage,
      material.title || null,
    );
    // player's methods are recreated every render — only re-load when the
    // material itself changes, same pattern as
    // components/preschool/reading-game.tsx's identical exhaustive-deps note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id]);

  const annotationsQuery = useListAnnotations(material.id);
  const annotations = useMemo(() => annotationsQuery.data ?? [], [annotationsQuery.data]);
  const addAnnotation = useAddAnnotation();

  const highlightedSentenceIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const annotation of annotations) {
      if (annotation.kind !== "highlight" || annotation.sentence_start === null || annotation.sentence_end === null) continue;
      for (let i = annotation.sentence_start; i <= annotation.sentence_end; i++) indices.add(i);
    }
    return indices;
  }, [annotations]);

  const comments = useMemo(() => annotations.filter((annotation) => annotation.kind === "comment"), [annotations]);

  const submitAnnotation = (
    kind: string,
    fields: { color?: string; geometry?: Record<string, unknown>; sentence_start?: number; sentence_end?: number; body?: string },
  ) => {
    addAnnotation.mutate(
      { materialId: material.id, data: { kind, ...fields } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAnnotationsQueryKey(material.id) }) },
    );
  };

  const handleHighlight = () => {
    if (!player.selectionTarget) return;
    const { sentenceIndices } = player.selectionTarget;
    submitAnnotation("highlight", {
      sentence_start: sentenceIndices[0],
      sentence_end: sentenceIndices[sentenceIndices.length - 1],
    });
    player.clearSelection();
  };

  const handleAddComment = (body: string) => {
    if (!player.selectionTarget) return;
    const { sentenceIndices } = player.selectionTarget;
    submitAnnotation("comment", {
      sentence_start: sentenceIndices[0],
      sentence_end: sentenceIndices[sentenceIndices.length - 1],
      body,
    });
    player.clearSelection();
  };

  const handleJumpToComment = (sentenceStart: number) => {
    player.sentenceRefs.current[sentenceStart]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-3 w-fit text-sm text-gray-600 hover:text-gray-900">
            ← {t("backToListButton")}
          </button>
        )}
        {material.source_url && (
          <p className="mb-3 text-sm text-gray-500">
            {t("sourceLinkLabel")}{" "}
            <a href={material.source_url} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:no-underline">
              {material.source_url}
            </a>
          </p>
        )}

        <div ref={contentRef} className="relative">
          <ReadAlongContent
            blocks={player.readingBlocks}
            speakingIndex={player.speakingIndex}
            sentenceRefs={player.sentenceRefs}
            selectionTarget={drawMode ? null : player.selectionTarget}
            onReadSelection={player.playSelection}
            readSelectionLabel={tReadAlong("readSelectionButton")}
            highlightedSentenceIndices={highlightedSentenceIndices}
          />
          <AnnotationCanvas
            containerRef={contentRef}
            drawMode={drawMode}
            tool={tool}
            color="#dc2626"
            annotations={annotations}
            onDraw={(kind, geometry, body) => submitAnnotation(kind, { color: "#dc2626", geometry, body })}
          />
        </div>

        <div className="h-24" aria-hidden="true" />

        <ReadAlongControlPanel
          speakingIndex={player.speakingIndex}
          currentParagraphIndex={player.currentParagraphIndex}
          paragraphCount={player.paragraphCount}
          language={player.language}
          onFromStart={player.playFromStart}
          onPrevious={player.playPreviousParagraph}
          onPlayPause={player.playPause}
          onNext={player.playNextParagraph}
          onLanguageChange={player.changeLanguage}
        />
      </div>

      <MaterialAnnotationPanel
        drawMode={drawMode}
        onDrawModeChange={setDrawMode}
        tool={tool}
        onToolChange={setTool}
        hasSelection={player.selectionTarget !== null}
        onHighlight={handleHighlight}
        onAddComment={handleAddComment}
        comments={comments}
        onJumpToComment={handleJumpToComment}
      />
    </div>
  );
}

// The lesson wizard's "Матеріали" tab — the student's own reading materials
// saved from the read-along tool (see components/add-material-dialog.tsx),
// distinct from the tutor-authored LessonAttachments shown on the "Теорія"
// tab (components/lesson-wizard/lesson-content.tsx). A single material opens
// straight into its detail/playback view; more than one shows a list first.
export function MaterialsStep({ materials }: { materials: StudentLessonMaterialOut[] }) {
  const t = useTranslations("MaterialsStep");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (materials.length === 0) {
    return <p className="text-sm text-gray-500">{t("emptyState")}</p>;
  }

  const selected = materials.length === 1 ? materials[0] : materials.find((material) => material.id === selectedId);

  if (selected) {
    return <MaterialDetail material={selected} onBack={materials.length > 1 ? () => setSelectedId(null) : undefined} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {materials.map((material) => (
        <li key={material.id}>
          <Card onClick={() => setSelectedId(material.id)} className="flex flex-col gap-1">
            <span className="font-medium text-gray-900">{material.title || t("untitledMaterial")}</span>
            {material.source_url && <span className="truncate text-sm text-blue-600">{material.source_url}</span>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
