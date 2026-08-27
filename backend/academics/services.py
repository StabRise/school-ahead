from .colors import SUBJECT_COLOR_PALETTE
from .models import Subject, SubjectBlock, Topic


def assign_subject_color(subject: Subject) -> str:
    """First palette color not already used by another Subject in the same
    school_class. Falls back to cycling by that class's subject count once
    the 30-color palette is exhausted, rather than raising."""
    used = set(
        Subject.objects.filter(school_class_id=subject.school_class_id)
        .exclude(pk=subject.pk)
        .exclude(color='')
        .values_list('color', flat=True)
    )
    for color in SUBJECT_COLOR_PALETTE:
        if color not in used:
            return color
    count = Subject.objects.filter(school_class_id=subject.school_class_id).exclude(pk=subject.pk).count()
    return SUBJECT_COLOR_PALETTE[count % len(SUBJECT_COLOR_PALETTE)]


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
    """Distributes the subject's non-pinned Topics evenly across its
    SubjectBlocks, in topic order_index order. A Topic belongs to exactly one
    SubjectBlock, and every Lesson under it inherits that block — so this is
    the single source of truth for lesson-to-block membership; StudentLesson
    carries no block of its own. Recomputes from scratch every time, so call
    this after any change to topics or blocks: topic create/update/delete/
    reorder, or subject.block_count changing via ensure_subject_blocks.

    A topic a tutor has manually moved (Topic.subject_block_manually_set,
    set by tutoring.api.set_topic_block) is excluded from this recompute and
    keeps its assigned block — unless that block no longer exists (e.g. the
    subject's block_count shrank), in which case it falls back to being
    auto-assigned like any other topic. See
    docs/interfaces/student/subjects.md."""
    topics = list(subject.topics.order_by('order_index'))
    blocks = list(subject.blocks.order_by('index'))
    if not topics or not blocks:
        return

    valid_block_ids = {block.id for block in blocks}
    auto_topics = [
        topic
        for topic in topics
        if not topic.subject_block_manually_set or topic.subject_block_id not in valid_block_ids
    ]
    if not auto_topics:
        return

    updated = []
    for block, topics_in_block in zip(blocks, _split_evenly(auto_topics, len(blocks))):
        for topic in topics_in_block:
            if topic.subject_block_id != block.id:
                topic.subject_block = block
                updated.append(topic)

    if updated:
        Topic.objects.bulk_update(updated, ['subject_block'])
