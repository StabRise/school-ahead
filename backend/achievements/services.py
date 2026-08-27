from .models import ProgressBadge


def get_badge_for_percent(percent: float) -> ProgressBadge | None:
    """The course-level badge matching a subject's completed_percent (see
    ProgressBadge). Falls back to the lowest-level badge if none of the
    configured tiers cover the given percent — e.g. gaps left by an admin
    edit — and to None only when no badges exist in the database at all."""
    return (
        ProgressBadge.objects.filter(min_percent__lte=percent, max_percent__gte=percent).order_by('-level').first()
        or ProgressBadge.objects.order_by('level').first()
    )
