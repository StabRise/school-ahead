from ninja import Schema


class ProgressBadgeOut(Schema):
    id: int
    name: str
    icon: str
    level: int
    min_percent: int
    max_percent: int


class BlockProgressOut(Schema):
    """One SubjectBlock's completion within a subject — total_count is every
    Lesson in the block's topics, not just this student's assigned ones. See
    lessons.services.compute_block_progress."""

    id: int
    index: int
    label: str
    completed_count: int
    total_count: int
    completed_percent: float


class SubjectAchievementOut(Schema):
    """One subject's card on the "Мої досягнення" page — overall completion
    across every lesson in the subject (not just assigned ones, see
    lessons.services.compute_completion) plus its per-semester breakdown and
    matching ProgressBadge."""

    subject_id: int
    subject_name: str
    subject_icon: str | None
    subject_color: str
    completed_count: int
    total_count: int
    completed_percent: float
    badge: ProgressBadgeOut | None
    blocks: list[BlockProgressOut]
