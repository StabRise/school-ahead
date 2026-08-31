import re
from dataclasses import dataclass, field

from .colors import SUBJECT_COLOR_PALETTE
from .models import Class, Subject, SubjectBlock, Topic


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
    docs/interfaces/student/subjects.md.

    Also refreshes every block's weeks_count/workload
    (recompute_block_workload) afterwards, since reassigning topics changes
    each block's lesson count. Lesson create/delete that don't touch topic
    membership (tutoring.api.delete_lesson, lessons.services.
    create_extra_lesson) call recompute_block_workload directly instead."""
    topics = list(subject.topics.order_by('order_index'))
    blocks = list(subject.blocks.order_by('index'))

    if topics and blocks:
        valid_block_ids = {block.id for block in blocks}
        auto_topics = [
            topic
            for topic in topics
            if not topic.subject_block_manually_set or topic.subject_block_id not in valid_block_ids
        ]
        if auto_topics:
            updated = []
            for block, topics_in_block in zip(blocks, _split_evenly(auto_topics, len(blocks))):
                for topic in topics_in_block:
                    if topic.subject_block_id != block.id:
                        topic.subject_block = block
                        updated.append(topic)

            if updated:
                Topic.objects.bulk_update(updated, ['subject_block'])

    for block in blocks:
        recompute_block_workload(block)


def compute_weeks_count(starts_on, ends_on) -> int | None:
    """Whole weeks between the two dates minus 2 weeks of vacation. None
    unless both dates are set."""
    if not starts_on or not ends_on:
        return None
    return (ends_on - starts_on).days // 7 - 2


def recompute_block_workload(block: SubjectBlock) -> None:
    """Refreshes one block's weeks_count and workload (lessons/week) from its
    dates and current lesson count — lesson_count / weeks_count, None
    whenever weeks_count isn't set (missing dates) or is 0. See
    assign_topics_to_blocks's docstring for what triggers this."""
    # Local import: lessons already imports academics.services, so importing
    # lessons.models at module level here would be circular.
    from lessons.models import Lesson

    block.weeks_count = compute_weeks_count(block.starts_on, block.ends_on)
    lesson_count = Lesson.objects.filter(topic__subject_block=block).count()
    block.workload = lesson_count / block.weeks_count if block.weeks_count else None
    block.save(update_fields=['weeks_count', 'workload'])


def recompute_subject_workloads(subject: Subject) -> int:
    """recompute_block_workload for every block of one subject — doesn't
    touch topic->block membership (see assign_topics_to_blocks for that).
    Returns how many blocks were refreshed."""
    blocks = list(subject.blocks.all())
    for block in blocks:
        recompute_block_workload(block)
    return len(blocks)


# --- Plan import (tutor's "Завантажити план" class-detail wizard) --------

_SEMESTER_MARKER_RE = re.compile(r'^\s*(\d+)\s*семестр\s*$', re.IGNORECASE)


def _split_plan_paragraphs(text: str) -> list[str]:
    """Blank-line-delimited paragraphs — the source plan files (see
    scraped.tmp/plans/*.md) are exported as plain text with a blank line
    between every subject name, semester marker, and content paragraph."""
    return [p.strip() for p in re.split(r'\n\s*\n', text.strip()) if p.strip()]


def _normalize_subject_name(name: str) -> str:
    """Collapses runs of internal whitespace to a single space — the source
    files sometimes have double spaces in a subject name (e.g. "ЗАРУБІЖНА
    ЛІТЕРАТУРА" with two spaces) that would otherwise stop it matching the
    same subject's normally-spaced name in another semester's file."""
    return re.sub(r'\s+', ' ', name).strip()


@dataclass
class PlanSection:
    subject_name: str
    semester_index: int
    text: str


def parse_plan_text(text: str) -> list[PlanSection]:
    """Splits a curriculum-plan upload into one PlanSection per subject. The
    source shape (scraped.tmp/plans/*.md) is a flat sequence of paragraphs:
    a subject-name paragraph immediately followed by a lone "N семестр"
    paragraph starts a new section; every paragraph after that, up to the
    next such pair (or EOF), is that section's body text. A file can mix
    subjects from different semesters (each section carries its own
    semester_index) — see import_class_plan for what happens with each."""
    paragraphs = _split_plan_paragraphs(text)
    # Position of each subject-name paragraph: the one right before a
    # paragraph that's *only* a semester marker.
    header_positions = [i - 1 for i in range(1, len(paragraphs)) if _SEMESTER_MARKER_RE.match(paragraphs[i])]

    sections = []
    for idx, name_pos in enumerate(header_positions):
        marker_pos = name_pos + 1
        semester_index = int(_SEMESTER_MARKER_RE.match(paragraphs[marker_pos]).group(1))
        body_end = header_positions[idx + 1] if idx + 1 < len(header_positions) else len(paragraphs)
        body = paragraphs[marker_pos + 1: body_end]
        subject_name = _normalize_subject_name(paragraphs[name_pos])
        sections.append(PlanSection(subject_name=subject_name, semester_index=semester_index, text='\n\n'.join(body)))
    return sections


@dataclass
class PlanImportSummary:
    # Subject names, in the order sections were processed — the class
    # detail page's "Завантажити план" result screen lists these directly
    # (see tutoring.api.upload_class_plan).
    subjects_found: list[str] = field(default_factory=list)
    subjects_added: list[str] = field(default_factory=list)
    blocks_updated: int = 0


def import_class_plan(school_class: Class, sections: list[PlanSection]) -> PlanImportSummary:
    """get_or_creates a Subject per section (matched case-insensitively by
    name within the class — the same subject often appears in different
    casing across semester files, e.g. "Алгебра" vs "АЛГЕБРА") and its
    SubjectBlocks (ensure_subject_blocks), then overwrites the section's
    semester_index block's description with its text. Safe to re-run —
    re-uploading the same or a corrected file just overwrites descriptions
    again.

    A newly-created Subject also gets its class's homeroom teacher
    auto-assigned as a tutor (tutoring.signals.on_subject_created ->
    assign_class_teacher_to_subject, triggered by the Subject.objects.create
    below) — same as every other Subject-creation path, not special-cased
    here."""
    summary = PlanImportSummary()
    for section in sections:
        subject = Subject.objects.filter(school_class=school_class, name__iexact=section.subject_name).first()
        if subject is None:
            subject = Subject.objects.create(school_class=school_class, name=section.subject_name)
            subject.color = assign_subject_color(subject)
            subject.save(update_fields=['color'])
            summary.subjects_added.append(subject.name)
        else:
            summary.subjects_found.append(subject.name)

        ensure_subject_blocks(subject)
        assign_topics_to_blocks(subject)

        block, _ = SubjectBlock.objects.get_or_create(subject=subject, index=section.semester_index)
        block.description = section.text
        block.save(update_fields=['description'])
        summary.blocks_updated += 1

    return summary
