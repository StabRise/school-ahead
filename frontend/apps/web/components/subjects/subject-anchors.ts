// Anchor ids for scrolling a Subject detail page (student `/subjects/[id]`
// or tutor `/tutor/subjects/[id]`) down to one semester (SubjectBlock) or
// topic section — used both by the headers on that page and by links into
// it from elsewhere (breadcrumbs, the lesson wizard's topic link). Topics
// key off their numeric id (always available on the DTOs that reference
// one), but SubjectBlock is only ever denormalized onto other DTOs as
// `subject_block_label` (a string, no id) — see lessons/schemas.py — so the
// block anchor is derived from that label text instead, which is why the
// header render site and every linking site must call this same function
// rather than inlining their own slug.
export function subjectBlockAnchorId(label: string): string {
  return `semester-${label.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

export function subjectTopicAnchorId(topicId: number): string {
  return `topic-${topicId}`;
}
