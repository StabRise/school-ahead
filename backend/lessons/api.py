from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_owner_student

from . import services
from .models import StudentLesson
from .schemas import (
    AddCommentIn,
    ConfirmUnderstandingIn,
    LessonCommentOut,
    RequestHelpIn,
    StudentLessonOut,
    SubmitQuizIn,
    SubmitQuizOut,
)

router = Router(tags=['student-lessons'], auth=CookieOrBearerJWTAuth())


def _get_owned(request: HttpRequest, student_lesson_id: int) -> StudentLesson:
    student_lesson = get_object_or_404(StudentLesson, id=student_lesson_id)
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
