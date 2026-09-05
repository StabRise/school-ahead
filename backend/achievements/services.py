from django.http import HttpRequest

from academics.models import Subject
from accounts.models import StudentProfile
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


def _absolute_file_url(file_field, request: HttpRequest) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    return request.build_absolute_uri(file_field.url)


def list_subject_achievements(student: StudentProfile, request: HttpRequest) -> list[SubjectAchievementOut]:
    """Every subject in `student`'s class with its overall completion
    (every Lesson in the subject, not just assigned ones — see
    lessons.services.compute_completion), its per-semester breakdown, and
    the matching ProgressBadge. Shared by the student's own "Мої
    досягнення" page (achievements.api.list_my_achievements) and the
    tutor's per-student overview page (tutoring.api.list_student_achievements)."""
    if student.school_class_id is None:
        return []

    subjects = Subject.objects.filter(school_class_id=student.school_class_id).order_by('name')
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
                subject_icon=_absolute_file_url(subject.icon, request),
                subject_color=subject.color,
                completed_count=completed,
                total_count=total,
                completed_percent=percent,
                badge=badge,
                blocks=blocks,
            )
        )
    return result
