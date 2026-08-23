from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate

from accounts.models import StudentProfile
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from lessons import services as lesson_services
from lessons.models import Lesson, StudentLesson, StudentLessonStatus
from lessons.schemas import AddCommentIn, LessonCommentOut, LessonOut

from . import services
from .models import TutorSubjectAssignment
from .schemas import (
    AssignmentOut,
    AssignStudentIn,
    GradeIn,
    LessonStudentOut,
    RequestRevisionIn,
    ResolveNeedHelpIn,
    SubmissionDetailOut,
    TutorFeedItemOut,
    TutorStudentOut,
)

router = Router(tags=['tutor'], auth=CookieOrBearerJWTAuth())


def _absolute_file_url(file_field, request: HttpRequest) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    return request.build_absolute_uri(file_field.url)


def _feed_item(student_lesson: StudentLesson) -> TutorFeedItemOut:
    student_user = student_lesson.student.user
    subject = student_lesson.lesson.topic.subject
    return TutorFeedItemOut(
        student_lesson_id=student_lesson.id,
        student_name=student_user.full_name or student_user.email,
        class_name=subject.school_class.name,
        subject_name=subject.name,
        lesson_title=student_lesson.lesson.title,
        status=student_lesson.status,
        help_note=student_lesson.help_note,
        scheduled_date=student_lesson.scheduled_date,
    )


def _scoped_queryset(
    request: HttpRequest,
    status: str,
    subject_id: int | None,
    class_id: int | None,
    student_id: int | None,
):
    subject_ids = services.get_tutor_subject_ids(request.auth)
    qs = StudentLesson.objects.filter(
        status=status, lesson__topic__subject_id__in=subject_ids
    ).select_related('student__user', 'lesson__topic__subject__school_class')
    if subject_id is not None:
        qs = qs.filter(lesson__topic__subject_id=subject_id)
    if class_id is not None:
        qs = qs.filter(lesson__topic__subject__school_class_id=class_id)
    if student_id is not None:
        qs = qs.filter(student_id=student_id)
    return qs


@router.get('/assignments', response=list[AssignmentOut])
def list_assignments(request: HttpRequest):
    assignments = TutorSubjectAssignment.objects.filter(
        tutor__user=request.auth, is_active=True
    ).select_related('subject__school_class')
    return [
        AssignmentOut(
            subject_id=a.subject_id,
            subject_name=a.subject.name,
            subject_icon=_absolute_file_url(a.subject.icon, request),
            class_id=a.subject.school_class_id,
            class_name=a.subject.school_class.name,
        )
        for a in assignments
    ]


@router.get('/subjects/{subject_id}/lessons', response=list[LessonOut], operation_id='list_tutor_subject_lessons')
def list_subject_lessons(request: HttpRequest, subject_id: int):
    """Plain curriculum content (no per-student status/grade) for the tutor's
    Subject detail page — grouped client-side by topic and subject block."""
    services.ensure_is_tutor_for_subject(request, subject_id)
    return (
        Lesson.objects.filter(topic__subject_id=subject_id)
        .select_related('topic__subject__school_class', 'topic__subject_block')
        .prefetch_related('materials', 'quiz_questions__choices')
        .order_by('topic__order_index', 'order_index')
    )


@router.get('/lessons/{lesson_id}', response=LessonOut, operation_id='get_tutor_lesson')
def get_lesson(request: HttpRequest, lesson_id: int):
    """Plain curriculum content for one lesson — same LessonOut shape the
    student wizard renders, so the tutor's preview reuses LessonContent
    as-is instead of a parallel renderer."""
    lesson = get_object_or_404(
        Lesson.objects.select_related('topic__subject__school_class', 'topic__subject_block'), id=lesson_id
    )
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    return lesson


@router.get(
    '/lessons/{lesson_id}/students',
    response=list[LessonStudentOut],
    operation_id='list_tutor_lesson_students',
)
def list_lesson_students(request: HttpRequest, lesson_id: int):
    lesson = get_object_or_404(Lesson.objects.select_related('topic'), id=lesson_id)
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    student_lessons = (
        StudentLesson.objects.filter(lesson_id=lesson_id)
        .select_related('student__user')
        .order_by('scheduled_date', 'student__user__first_name')
    )
    return [
        LessonStudentOut(
            student_lesson_id=sl.id,
            student_name=sl.student.user.full_name or sl.student.user.email,
            scheduled_date=sl.scheduled_date,
            status=sl.status,
        )
        for sl in student_lessons
    ]


@router.get(
    '/lessons/{lesson_id}/assignable-students',
    response=list[TutorStudentOut],
    operation_id='list_assignable_students',
)
def list_assignable_students(request: HttpRequest, lesson_id: int):
    """Students in the lesson's class who don't already have a StudentLesson
    for it — powers the "assign to student" picker on the tutor's lesson
    detail page."""
    lesson = get_object_or_404(Lesson.objects.select_related('topic__subject'), id=lesson_id)
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    already_assigned_ids = StudentLesson.objects.filter(lesson_id=lesson_id).values_list('student_id', flat=True)
    students = (
        StudentProfile.objects.filter(school_class_id=lesson.topic.subject.school_class_id)
        .exclude(id__in=already_assigned_ids)
        .select_related('user', 'school_class')
        .order_by('user__first_name', 'user__last_name')
    )
    return [
        TutorStudentOut(
            id=s.id,
            name=s.user.full_name or s.user.email,
            class_id=s.school_class_id,
            class_name=s.school_class.name if s.school_class else '',
        )
        for s in students
    ]


@router.post(
    '/lessons/{lesson_id}/assign',
    response=LessonStudentOut,
    operation_id='assign_lesson_to_student',
)
def assign_lesson_to_student(request: HttpRequest, lesson_id: int, payload: AssignStudentIn):
    require_csrf(request)
    lesson = get_object_or_404(Lesson.objects.select_related('topic__subject'), id=lesson_id)
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    student = get_object_or_404(
        StudentProfile.objects.select_related('user'),
        id=payload.student_id,
        school_class_id=lesson.topic.subject.school_class_id,
    )
    try:
        student_lesson = lesson_services.assign_student(lesson, student, payload.scheduled_date)
    except lesson_services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return LessonStudentOut(
        student_lesson_id=student_lesson.id,
        student_name=student.user.full_name or student.user.email,
        scheduled_date=student_lesson.scheduled_date,
        status=student_lesson.status,
    )


@router.get('/students', response=list[TutorStudentOut])
def list_students(request: HttpRequest):
    students = services.get_tutor_students(request.auth)
    return [
        TutorStudentOut(
            id=s.id,
            name=s.user.full_name or s.user.email,
            class_id=s.school_class_id,
            class_name=s.school_class.name if s.school_class else '',
        )
        for s in students
    ]


@router.get('/need-help', response=list[TutorFeedItemOut])
@paginate
def need_help(
    request: HttpRequest,
    subject: int | None = None,
    class_id: int | None = None,
    student: int | None = None,
):
    qs = _scoped_queryset(request, StudentLessonStatus.NEED_HELP, subject, class_id, student)
    return [_feed_item(sl) for sl in qs]


@router.get('/pending-review', response=list[TutorFeedItemOut])
@paginate
def pending_review(
    request: HttpRequest,
    subject: int | None = None,
    class_id: int | None = None,
    student: int | None = None,
):
    qs = _scoped_queryset(request, StudentLessonStatus.PENDING_REVIEW, subject, class_id, student)
    return [_feed_item(sl) for sl in qs]


def _get_scoped_student_lesson(request: HttpRequest, student_lesson_id: int) -> StudentLesson:
    student_lesson = get_object_or_404(
        StudentLesson.objects.select_related(
            'student__user', 'lesson__topic__subject__school_class'
        ),
        id=student_lesson_id,
    )
    services.ensure_is_tutor_for_subject(request, student_lesson.lesson.topic.subject_id)
    return student_lesson


@router.get('/submissions/{student_lesson_id}', response=SubmissionDetailOut)
def get_submission(request: HttpRequest, student_lesson_id: int):
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    student_user = student_lesson.student.user
    subject = student_lesson.lesson.topic.subject
    # Built from a manual dict (not a single ORM object) so it must go through
    # model_validate with an explicit context — LessonSubmissionOut.resolve_file
    # needs request in context to build absolute URLs, which a plain
    # SubmissionDetailOut(...) constructor call can't supply.
    return SubmissionDetailOut.model_validate(
        {
            'student_lesson_id': student_lesson.id,
            'student_name': student_user.full_name or student_user.email,
            'class_name': subject.school_class.name,
            'subject_name': subject.name,
            'lesson_title': student_lesson.lesson.title,
            'status': student_lesson.status,
            'grading_type': student_lesson.lesson.grading_type,
            'help_note': student_lesson.help_note,
            'submissions': list(student_lesson.submissions.order_by('submitted_at')),
        },
        context={'request': request},
    )


@router.post('/submissions/{student_lesson_id}/grade', response=SubmissionDetailOut)
def grade(request: HttpRequest, student_lesson_id: int, payload: GradeIn):
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    try:
        lesson_services.grade_submission(
            student_lesson,
            request.auth,
            grade_points=payload.grade_points,
            grade_result=payload.grade_result,
            feedback=payload.feedback,
        )
    except lesson_services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return get_submission(request, student_lesson_id)


@router.post('/submissions/{student_lesson_id}/request-revision', response=SubmissionDetailOut)
def request_revision(request: HttpRequest, student_lesson_id: int, payload: RequestRevisionIn):
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    try:
        lesson_services.request_revision(student_lesson, request.auth, payload.feedback)
    except lesson_services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return get_submission(request, student_lesson_id)


@router.post('/need-help/{student_lesson_id}/resolve', response=SubmissionDetailOut)
def resolve_need_help(request: HttpRequest, student_lesson_id: int, payload: ResolveNeedHelpIn):
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    try:
        lesson_services.resolve_need_help(
            student_lesson,
            request.auth,
            to_status=payload.to_status,
            grade_points=payload.grade_points,
            grade_result=payload.grade_result,
            feedback=payload.feedback,
        )
    except lesson_services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return get_submission(request, student_lesson_id)


@router.get(
    '/submissions/{student_lesson_id}/comments',
    response=list[LessonCommentOut],
    operation_id='list_tutor_lesson_comments',
)
def list_comments(request: HttpRequest, student_lesson_id: int):
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    return list(student_lesson.comments.select_related('author').all())


@router.post(
    '/submissions/{student_lesson_id}/comments',
    response=LessonCommentOut,
    operation_id='add_tutor_lesson_comment',
)
def add_comment(request: HttpRequest, student_lesson_id: int, payload: AddCommentIn):
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    return lesson_services.add_comment(student_lesson, request.auth, payload.body)
