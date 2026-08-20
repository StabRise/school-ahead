from .models import Subject, SubjectBlock


def ensure_subject_blocks(subject: Subject) -> None:
    """Makes the subject's SubjectBlock rows match its current block_count
    (1..N, default 'Semester N' labels). Purely structural — deciding which
    Lesson falls into which block is lessons.services' job (it needs Lesson
    data, which academics doesn't depend on). See docs/core/data.md and
    docs/architecture/02-data-model.md."""
    existing = {block.index: block for block in subject.blocks.all()}

    for index in range(1, subject.block_count + 1):
        if index not in existing:
            SubjectBlock.objects.create(subject=subject, index=index)

    for index, block in existing.items():
        if index > subject.block_count:
            block.delete()
