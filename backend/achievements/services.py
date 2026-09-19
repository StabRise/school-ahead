from django.http import HttpRequest

from academics.models import Subject
from accounts.models import StudentProfile
from common.images import icon_url
from lessons import services as lesson_services
from lessons.models import Lesson, StudentLesson

from .models import ProgressBadge
from .schemas import SubjectAchievementOut


def get_badge_for_percent(percent: float) -> ProgressBadge | None:
    """The course-level badge matching a subject's completed_percent (see
    ProgressBadge). Falls back to the lowest-level badge if none of the
    configured tiers cover the given percent — e.g. gaps left by an admin
    edit — and to None only when no badges exist in the database at all."""
    return (
        ProgressBadge.objects.filter(min_percent__lte=percent, max_percent__gte=percent).order_by('-level').first()
        or ProgressBadge.objects.order_by('level').first()
    )


def list_subject_achievements(student: StudentProfile, request: HttpRequest) -> list[SubjectAchievementOut]:
    """Every subject in `student`'s class with its overall completion
    (every Lesson in the subject, not just assigned ones — see
    lessons.services.compute_completion), its per-semester breakdown, and
    the matching ProgressBadge. Shared by the student's own "Мої
    досягнення" page (achievements.api.list_my_achievements) and the
    tutor's per-student overview page (tutoring.api.list_student_achievements)."""
    if student.school_class_id is None:
        return []

    subjects = (
        Subject.objects.filter(school_class_id=student.school_class_id)
        .select_related('group')
        .order_by('order_index', 'name')
    )
    result = []
    for subject in subjects:
        total_lessons = Lesson.objects.filter(topic__subject_id=subject.id).count()
        student_lessons = StudentLesson.objects.filter(student=student, lesson__topic__subject_id=subject.id)
        completed, total, percent = lesson_services.compute_completion(total_lessons, student_lessons)
        blocks = lesson_services.compute_block_progress(subject.id, student)
        badge = get_badge_for_percent(percent)
        result.append(
            SubjectAchievementOut(
                subject_id=subject.id,
                subject_name=subject.name,
                subject_icon=icon_url(subject, request),
                subject_color=subject.color,
                order_index=subject.order_index,
                group_id=subject.group_id,
                group_name=subject.group.name if subject.group_id else None,
                group_order_index=subject.group.order_index if subject.group_id else 0,
                completed_count=completed,
                total_count=total,
                completed_percent=percent,
                badge=badge,
                blocks=blocks,
            )
        )
    return result
