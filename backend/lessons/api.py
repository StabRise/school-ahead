from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.pagination import LimitOffsetPagination, paginate

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_owner_student, get_own_student_profile

from . import services
from .models import QuizQuestion, StudentLesson
from .schemas import (
    AddCommentIn,
    CompletionProgressOut,
    ConfirmUnderstandingIn,
    LessonCommentOut,
    QuizHintOut,
    RequestHelpIn,
    StudentLessonOut,
    SubmitQuizIn,
    SubmitQuizOut,
    TopicLessonOut,
)

router = Router(tags=['student-lessons'], auth=CookieOrBearerJWTAuth())


def _get_owned(request: HttpRequest, student_lesson_id: int) -> StudentLesson:
    student_lesson = get_object_or_404(
        StudentLesson.objects.select_related('lesson__topic__subject', 'lesson__topic__subject_block'),
        id=student_lesson_id,
    )
    ensure_is_owner_student(request, student_lesson)
    return student_lesson


@router.get('/{student_lesson_id}', response=StudentLessonOut, operation_id='get_student_lesson')
def get_student_lesson(request: HttpRequest, student_lesson_id: int):
    student_lesson = _get_owned(request, student_lesson_id)
    services.ensure_started(student_lesson, request.auth)
    return student_lesson


@router.post('/{student_lesson_id}/start', response=StudentLessonOut, operation_id='start_lesson')
def start(request: HttpRequest, student_lesson_id: int):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.start(student_lesson, request.auth)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/submit-quiz', response=SubmitQuizOut, operation_id='submit_quiz')
def submit_quiz(request: HttpRequest, student_lesson_id: int, payload: SubmitQuizIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        score = services.submit_quiz(student_lesson, request.auth, payload.answers)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return SubmitQuizOut(score_percent=float(score), student_lesson=student_lesson)


@router.get(
    '/quiz-questions/{question_id}/hint',
    response=QuizHintOut,
    operation_id='get_quiz_question_hint',
)
def get_quiz_question_hint(request: HttpRequest, question_id: int):
    """Powers the preschool quiz's raccoon-mascot hint — see
    docs/interfaces/student/preschool/lesson.md. Scoped to questions on a
    lesson the requesting student actually has assigned, same as any other
    self-scoped student endpoint."""
    question = get_object_or_404(QuizQuestion.objects.select_related('lesson'), id=question_id)
    student = get_own_student_profile(request)
    owns_lesson = StudentLesson.objects.filter(student=student, lesson=question.lesson).exists()
    if not owns_lesson:
        raise HttpError(403, 'Not your lesson')

    correct_choice = question.choices.filter(is_correct=True).first()
    return QuizHintOut(correct_choice_id=correct_choice.id if correct_choice else None)


@router.post(
    '/{student_lesson_id}/confirm-understanding',
    response=StudentLessonOut,
    operation_id='confirm_understanding',
)
def confirm_understanding(request: HttpRequest, student_lesson_id: int, payload: ConfirmUnderstandingIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.confirm_understanding(student_lesson, request.auth, payload.understood)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/submit-task', response=StudentLessonOut, operation_id='submit_task')
def submit_task(
    request: HttpRequest,
    student_lesson_id: int,
    comment: str = Form(''),
    file: UploadedFile | None = File(None),
):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.submit_task(student_lesson, request.auth, file=file, comment=comment)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/request-help', response=StudentLessonOut, operation_id='request_help')
def request_help(request: HttpRequest, student_lesson_id: int, payload: RequestHelpIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.request_help(student_lesson, request.auth, payload.note)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/resubmit', response=StudentLessonOut, operation_id='resubmit_lesson')
def resubmit(
    request: HttpRequest,
    student_lesson_id: int,
    comment: str = Form(''),
    file: UploadedFile | None = File(None),
):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.resubmit(student_lesson, request.auth, file=file, comment=comment)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post(
    '/{student_lesson_id}/resolve-need-help',
    response=StudentLessonOut,
    operation_id='resolve_own_need_help',
)
def resolve_own_need_help(request: HttpRequest, student_lesson_id: int):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.resolve_own_help_request(student_lesson, request.auth)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.get(
    '/{student_lesson_id}/comments',
    response=list[LessonCommentOut],
    operation_id='list_lesson_comments',
)
def list_comments(request: HttpRequest, student_lesson_id: int):
    student_lesson = _get_owned(request, student_lesson_id)
    return list(student_lesson.comments.select_related('author').all())


@router.post(
    '/{student_lesson_id}/comments',
    response=LessonCommentOut,
    operation_id='add_lesson_comment',
)
def add_comment(request: HttpRequest, student_lesson_id: int, payload: AddCommentIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    return services.add_comment(student_lesson, request.auth, payload.body)


@router.get(
    '/subjects/{subject_id}/progress',
    response=CompletionProgressOut,
    operation_id='get_subject_progress',
)
def get_subject_progress(request: HttpRequest, subject_id: int):
    """Curriculum-wide, not just what's been scheduled so far — see
    docs/interfaces/student/subjects.md."""
    student = get_own_student_profile(request)
    qs = StudentLesson.objects.filter(student=student, lesson__topic__subject_id=subject_id)
    completed, total, percent = services.compute_completion(qs)
    return CompletionProgressOut(completed_count=completed, total_count=total, completed_percent=percent)


@router.get(
    '/topics/{topic_id}/progress',
    response=CompletionProgressOut,
    operation_id='get_topic_progress',
)
def get_topic_progress(request: HttpRequest, topic_id: int):
    student = get_own_student_profile(request)
    qs = StudentLesson.objects.filter(student=student, lesson__topic_id=topic_id)
    completed, total, percent = services.compute_completion(qs)
    return CompletionProgressOut(completed_count=completed, total_count=total, completed_percent=percent)


@router.get(
    '/topics/{topic_id}/lessons',
    response=list[TopicLessonOut],
    operation_id='list_topic_lessons',
)
@paginate(LimitOffsetPagination, page_size=10)
def list_topic_lessons(request: HttpRequest, topic_id: int):
    """Powers the Topic detail page's paginated lessons table. See
    docs/interfaces/student/subjects.md."""
    student = get_own_student_profile(request)
    return (
        StudentLesson.objects.filter(student=student, lesson__topic_id=topic_id)
        .select_related('lesson__topic__subject_block')
        .order_by('lesson__order_index')
    )
