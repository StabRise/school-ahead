from ninja.errors import HttpError


def ensure_is_owner_student(request, student_lesson) -> None:
    """403s unless the authenticated user's StudentProfile owns this
    StudentLesson. See docs/architecture/01-backend-apps.md (common app)."""
    student_profile = getattr(request.auth, 'student_profile', None)
    if student_profile is None or student_lesson.student_id != student_profile.id:
        raise HttpError(403, 'Not the owner of this lesson')
