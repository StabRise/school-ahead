from django.http import HttpRequest
from ninja import Router

from academics.models import Subject
from common.auth import CookieOrBearerJWTAuth
from common.permissions import get_own_student_profile
from lessons import services as lesson_services
from lessons.models import Lesson, StudentLesson

from . import services
from .schemas import SubjectAchievementOut

router = Router(tags=['achievements'], auth=CookieOrBearerJWTAuth())


def _absolute_file_url(file_field, request: HttpRequest) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    return request.build_absolute_uri(file_field.url)


@router.get('/subjects', response=list[SubjectAchievementOut], operation_id='list_my_achievements')
def list_my_achievements(request: HttpRequest):
    """Powers the "Мої досягнення" page: every subject in the student's own
    class with its overall completion (every Lesson in the subject, not
    just assigned ones — see lessons.services.compute_completion), its
    per-semester breakdown, and the matching ProgressBadge."""
    student = get_own_student_profile(request)
    if student.school_class_id is None:
        return []

    subjects = Subject.objects.filter(school_class_id=student.school_class_id).order_by('name')
    result = []
    for subject in subjects:
        total_lessons = Lesson.objects.filter(topic__subject_id=subject.id).count()
        student_lessons = StudentLesson.objects.filter(student=student, lesson__topic__subject_id=subject.id)
        completed, total, percent = lesson_services.compute_completion(total_lessons, student_lessons)
        blocks = lesson_services.compute_block_progress(subject.id, student)
        badge = services.get_badge_for_percent(percent)
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
