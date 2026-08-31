import type { SubjectBlockOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

export interface BlockGroup {
  key: string;
  label: string | null;
  // The real SubjectBlock id a topic gets pinned to when dropped into this
  // group (tutor's set_topic_block) — null for the blockless "all" fallback
  // and for "unassigned", neither of which is a valid drag-and-drop target.
  // Unused (but harmless) on the student side, which only reads topics/label.
  blockId: number | null;
  topics: TopicOut[];
  // Lessons/week for this block (lesson_count / weeks_count), null until
  // both the block's dates and weeks_count are set. See
  // academics.services.recompute_block_workload.
  workload: number | null;
}

// Grouped off the subject's actual SubjectBlock rows (id + label, in index
// order) rather than inferred from contiguous topic order — a tutor can
// move a topic to any block (set_topic_block, or by dragging it — see
// TutorSubjectDetailPage's handleDrop), which can break the even-split
// contiguity a scan-based grouping would rely on. A topic whose block no
// longer exists (should self-heal on the next assign_topics_to_blocks
// recompute) falls into a trailing "unassigned" group instead of
// disappearing. Empty real blocks are kept (not filtered out) so a tutor can
// still drag a topic into a currently-empty semester. Shared by the tutor's
// Subject detail page and the student's Course plan, which both render the
// same semester grouping.
export function groupTopicsByBlock(topics: TopicOut[], blocks: SubjectBlockOut[]): BlockGroup[] {
  if (blocks.length === 0) {
    return topics.length > 0 ? [{ key: "all", label: null, blockId: null, topics, workload: null }] : [];
  }

  const blockIds = new Set(blocks.map((block) => block.id));
  const topicsByBlockId = new Map<number, TopicOut[]>();
  const unassigned: TopicOut[] = [];

  for (const topic of topics) {
    if (topic.subject_block_id !== null && blockIds.has(topic.subject_block_id)) {
      const list = topicsByBlockId.get(topic.subject_block_id) ?? [];
      list.push(topic);
      topicsByBlockId.set(topic.subject_block_id, list);
    } else {
      unassigned.push(topic);
    }
  }

  const groups: BlockGroup[] = blocks.map((block) => ({
    key: `block-${block.id}`,
    label: block.label,
    blockId: block.id,
    topics: topicsByBlockId.get(block.id) ?? [],
    workload: block.workload,
  }));

  if (unassigned.length > 0) {
    groups.push({ key: "unassigned", label: null, blockId: null, topics: unassigned, workload: null });
  }

  return groups;
}
