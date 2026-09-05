from django.http import HttpRequest
from ninja import Router

from common.auth import CookieOrBearerJWTAuth
from common.permissions import get_own_student_profile

from . import services
from .schemas import SubjectAchievementOut

router = Router(tags=['achievements'], auth=CookieOrBearerJWTAuth())


@router.get('/subjects', response=list[SubjectAchievementOut], operation_id='list_my_achievements')
def list_my_achievements(request: HttpRequest):
    """Powers the "Мої досягнення" page: every subject in the student's own
    class with its overall completion (every Lesson in the subject, not
    just assigned ones — see lessons.services.compute_completion), its
    per-semester breakdown, and the matching ProgressBadge."""
    student = get_own_student_profile(request)
    return services.list_subject_achievements(student, request)
