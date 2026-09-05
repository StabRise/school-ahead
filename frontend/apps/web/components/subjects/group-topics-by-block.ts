import type { SubjectBlockOut, TopicOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

export interface BlockGroup {
  key: string;
  label: string | null;
  topics: TopicOut[];
  // Lessons/week for this block (lesson_count / weeks_count), null until
  // both the block's dates and weeks_count are set. See
  // academics.services.recompute_block_workload.
  workload: number | null;
}

// Grouped off the subject's actual SubjectBlock rows (id + label, in index
// order) rather than inferred from contiguous topic order — a tutor can
// move a topic to any block (TopicBlockSelect, tutor-subject-detail-page.tsx),
// which can break the even-split contiguity a scan-based grouping would rely
// on. A topic whose block no longer exists (should self-heal on the next
// assign_topics_to_blocks recompute) falls into a trailing "unassigned"
// group instead of disappearing. Empty real blocks are kept (not filtered
// out) so an empty semester still shows up.
export function groupTopicsByBlock(topics: TopicOut[], blocks: SubjectBlockOut[]): BlockGroup[] {
  if (blocks.length === 0) {
    return topics.length > 0 ? [{ key: "all", label: null, topics, workload: null }] : [];
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
    topics: topicsByBlockId.get(block.id) ?? [],
    workload: block.workload,
  }));

  if (unassigned.length > 0) {
    groups.push({ key: "unassigned", label: null, topics: unassigned, workload: null });
  }

  return groups;
}
