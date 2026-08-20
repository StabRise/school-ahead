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
    ConfirmUnderstandingIn,
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


@router.get('/{student_lesson_id}', response=StudentLessonOut)
def get_student_lesson(request: HttpRequest, student_lesson_id: int):
    return _get_owned(request, student_lesson_id)


@router.post('/{student_lesson_id}/start', response=StudentLessonOut)
def start(request: HttpRequest, student_lesson_id: int):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.start(student_lesson, request.auth)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/submit-quiz', response=SubmitQuizOut)
def submit_quiz(request: HttpRequest, student_lesson_id: int, payload: SubmitQuizIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        score = services.submit_quiz(student_lesson, request.auth, payload.answers)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return SubmitQuizOut(score_percent=float(score), student_lesson=student_lesson)


@router.post('/{student_lesson_id}/confirm-understanding', response=StudentLessonOut)
def confirm_understanding(request: HttpRequest, student_lesson_id: int, payload: ConfirmUnderstandingIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.confirm_understanding(student_lesson, request.auth, payload.understood)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/submit-task', response=StudentLessonOut)
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


@router.post('/{student_lesson_id}/request-help', response=StudentLessonOut)
def request_help(request: HttpRequest, student_lesson_id: int, payload: RequestHelpIn):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.request_help(student_lesson, request.auth, payload.note)
    except services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return student_lesson


@router.post('/{student_lesson_id}/resubmit', response=StudentLessonOut)
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
