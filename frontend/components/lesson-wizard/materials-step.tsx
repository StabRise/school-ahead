"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Card } from "@/components/card";
import { ReadAlongContent } from "@/components/read-along-content";
import { ReadAlongControlPanel } from "@/components/read-along-control-panel";
import { AddAnnotationCommentDialog } from "./add-annotation-comment-dialog";
import { AnnotationCanvas } from "./annotation-canvas";
import { MaterialAnnotationPanel } from "./material-annotation-panel";
import { useReadAlongPlayer } from "@/lib/use-read-along-player";
import { readingBlocksFromMaterialBlocks } from "@/lib/reading-blocks";
import { HIGHLIGHT_COLORS, type DrawTool } from "@/lib/material-annotations";
import type { SpeechLanguage } from "@/lib/piper-tts";
import {
  getListAnnotationsQueryKey,
  useAddAnnotation,
  useDeleteMaterialSentences,
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
function MaterialDetail({
  material,
  onBack,
  onChanged,
}: {
  material: StudentLessonMaterialOut;
  onBack?: () => void;
  /** Called after the material's saved content changes (e.g. a deletion) — lets the wizard refetch so re-opening this material later reflects it too. */
  onChanged: () => void;
}) {
  const t = useTranslations("MaterialsStep");
  const tReadAlong = useTranslations("ReadAlong");
  const player = useReadAlongPlayer(true);
  const loadedMaterialId = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [drawMode, setDrawMode] = useState(false);
  const [tool, setTool] = useState<DrawTool>("rectangle");
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  // Captured the instant "add comment" is clicked, not read live at submit
  // time — opening the dialog moves focus away from the document and can
  // collapse the student's text selection before they finish typing.
  const pendingCommentIndicesRef = useRef<number[] | null>(null);

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
  const deleteMaterialSentences = useDeleteMaterialSentences();

  const highlightColors = useMemo(() => {
    const colors = new Map<number, string>();
    for (const annotation of annotations) {
      if (annotation.kind !== "highlight" || annotation.sentence_start === null || annotation.sentence_end === null) continue;
      for (let i = annotation.sentence_start; i <= annotation.sentence_end; i++) colors.set(i, annotation.color || HIGHLIGHT_COLORS[0]);
    }
    return colors;
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

  const handleHighlight = (color: string) => {
    if (!player.selectionTarget) return;
    const { sentenceIndices } = player.selectionTarget;
    submitAnnotation("highlight", {
      color,
      sentence_start: sentenceIndices[0],
      sentence_end: sentenceIndices[sentenceIndices.length - 1],
    });
    player.clearSelection();
  };

  // Snapshots the selection's sentence range *before* the dialog opens —
  // see pendingCommentIndicesRef's comment above.
  const handleRequestComment = () => {
    if (!player.selectionTarget) return;
    pendingCommentIndicesRef.current = player.selectionTarget.sentenceIndices;
    setCommentDialogOpen(true);
  };

  const handleSubmitComment = (body: string) => {
    const sentenceIndices = pendingCommentIndicesRef.current;
    if (!sentenceIndices) return;
    submitAnnotation("comment", {
      sentence_start: sentenceIndices[0],
      sentence_end: sentenceIndices[sentenceIndices.length - 1],
      body,
    });
    pendingCommentIndicesRef.current = null;
    setCommentDialogOpen(false);
    player.clearSelection();
  };

  // Permanently removes the selected sentences from the material's saved
  // content (backend/lessons/services.py's delete_material_sentences also
  // remaps/drops any highlight or comment anchored to those sentences).
  // Reloads the player straight from the mutation's response for instant
  // feedback, and calls onChanged so the wizard's own data (which still
  // holds the pre-delete content) is fresh if the student navigates away
  // and reopens this material later.
  const handleDeleteSelection = () => {
    if (!player.selectionTarget) return;
    const { sentenceIndices } = player.selectionTarget;
    player.clearSelection();
    deleteMaterialSentences.mutate(
      { materialId: material.id, data: { sentence_indices: sentenceIndices } },
      {
        onSuccess: (updatedMaterial) => {
          player.load(readingBlocksFromMaterialBlocks(updatedMaterial.content), player.language, player.readingTitle);
          queryClient.invalidateQueries({ queryKey: getListAnnotationsQueryKey(material.id) });
          onChanged();
        },
      },
    );
  };

  // Scrolls to *and actually selects* (native browser selection, via the
  // Range API) the sentences a comment was left on — clicking a comment
  // should make it obvious which text it refers to, not just scroll near
  // it. Also naturally re-arms selectionTarget for that range, so the
  // student can re-highlight/re-comment/delete it right away if they want.
  const handleJumpToComment = (sentenceStart: number, sentenceEnd: number) => {
    const startEl = player.sentenceRefs.current[sentenceStart];
    const endEl = player.sentenceRefs.current[sentenceEnd];
    if (!startEl || !endEl) return;
    startEl.scrollIntoView({ behavior: "smooth", block: "center" });
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStartBefore(startEl);
    range.setEndAfter(endEl);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    // Right padding on wide screens clears the annotation panel, which is
    // fixed to the viewport's right edge (see MaterialAnnotationPanel) —
    // fixed rather than a normal flex column so it stays visible while
    // scrolling a long material, instead of scrolling away with the content.
    <div className="lg:pr-80">
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
          highlightColors={highlightColors}
          sourceLanguage={player.language}
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

      <MaterialAnnotationPanel
        drawMode={drawMode}
        onDrawModeChange={setDrawMode}
        tool={tool}
        onToolChange={setTool}
        hasSelection={player.selectionTarget !== null}
        onHighlight={handleHighlight}
        onRequestComment={handleRequestComment}
        onDeleteSelection={handleDeleteSelection}
        comments={comments}
        onJumpToComment={handleJumpToComment}
      />

      <AddAnnotationCommentDialog
        open={commentDialogOpen}
        onOpenChange={setCommentDialogOpen}
        onSubmit={handleSubmitComment}
      />
    </div>
  );
}

// The lesson wizard's "Матеріали" tab — the student's own reading materials
// saved from the read-along tool (see components/add-material-dialog.tsx),
// distinct from the tutor-authored LessonAttachments shown on the "Теорія"
// tab (components/lesson-wizard/lesson-content.tsx). A single material opens
// straight into its detail/playback view; more than one shows a list first.
export function MaterialsStep({
  materials,
  onChanged,
}: {
  materials: StudentLessonMaterialOut[];
  /** Called when a material's saved content changes (e.g. a deletion) — the wizard should refetch its StudentLesson data. */
  onChanged: () => void;
}) {
  const t = useTranslations("MaterialsStep");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Each material has its own link (?material=<id>, alongside ?step=...) so
  // it can be shared/bookmarked and so components/add-material-dialog.tsx
  // can redirect straight to the one just added — same query-param-based
  // sub-navigation lesson-wizard.tsx's own setStep already uses for ?step.
  const materialIdParam = searchParams.get("material");
  const selectedId = materialIdParam ? Number(materialIdParam) : null;

  const setSelectedId = (id: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null) params.delete("material");
    else params.set("material", String(id));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (materials.length === 0) {
    return <p className="text-sm text-gray-500">{t("emptyState")}</p>;
  }

  const selected = materials.length === 1 ? materials[0] : materials.find((material) => material.id === selectedId);

  if (selected) {
    return (
      <MaterialDetail
        material={selected}
        onBack={materials.length > 1 ? () => setSelectedId(null) : undefined}
        onChanged={onChanged}
      />
    );
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
