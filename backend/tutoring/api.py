from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from lessons import services as lesson_services
from lessons.models import StudentLesson, StudentLessonStatus
from lessons.schemas import AddCommentIn, LessonCommentOut

from . import services
from .models import TutorSubjectAssignment
from .schemas import (
    AssignmentOut,
    GradeIn,
    RequestRevisionIn,
    ResolveNeedHelpIn,
    SubmissionDetailOut,
    TutorFeedItemOut,
    TutorStudentOut,
)

router = Router(tags=['tutor'], auth=CookieOrBearerJWTAuth())


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
            class_id=a.subject.school_class_id,
            class_name=a.subject.school_class.name,
        )
        for a in assignments
    ]


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
