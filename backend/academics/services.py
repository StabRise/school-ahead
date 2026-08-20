from .models import Subject, SubjectBlock, Topic


def ensure_subject_blocks(subject: Subject) -> None:
    """Makes the subject's SubjectBlock rows match its current block_count
    (1..N, default 'Semester N' labels). See docs/core/data.md and
    docs/architecture/02-data-model.md. Callers should follow up with
    assign_topics_to_blocks — the block set just changed underneath it."""
    existing = {block.index: block for block in subject.blocks.all()}

    for index in range(1, subject.block_count + 1):
        if index not in existing:
            SubjectBlock.objects.create(subject=subject, index=index)

    for index, block in existing.items():
        if index > subject.block_count:
            block.delete()


def _split_evenly(items: list, n_groups: int) -> list[list]:
    """Even split with any remainder going to the first groups — same rule
    docs/core/data.md specifies for subject blocks (also duplicated in
    scheduling.services for weeks, a different bounded context)."""
    n_groups = max(1, n_groups)
    base, remainder = divmod(len(items), n_groups)
    groups = []
    idx = 0
    for i in range(n_groups):
        size = base + (1 if i < remainder else 0)
        groups.append(items[idx: idx + size])
        idx += size
    return groups


def assign_topics_to_blocks(subject: Subject) -> None:
    """Distributes the subject's Topics evenly across its SubjectBlocks, in
    topic order_index order. A Topic belongs to exactly one SubjectBlock, and
    every Lesson under it inherits that block — so this is the single source
    of truth for lesson-to-block membership; StudentLesson carries no block
    of its own. Recomputes from scratch every time (no per-topic override
    concept), so call this after any change to topics or blocks: topic
    create/update/delete/reorder, or subject.block_count changing via
    ensure_subject_blocks. See docs/interfaces/student/subjects.md."""
    topics = list(subject.topics.order_by('order_index'))
    blocks = list(subject.blocks.order_by('index'))
    if not topics or not blocks:
        return

    updated = []
    for block, topics_in_block in zip(blocks, _split_evenly(topics, len(blocks))):
        for topic in topics_in_block:
            if topic.subject_block_id != block.id:
                topic.subject_block = block
                updated.append(topic)

    if updated:
        Topic.objects.bulk_update(updated, ['subject_block'])
