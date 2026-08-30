from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.pagination import LimitOffsetPagination, paginate

from achievements import services as achievement_services
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_owner_student, get_own_student_profile

from . import services
from .models import Lesson, QuizQuestion, StudentLesson, StudentLessonStatus
from .schemas import (
    AddCommentIn,
    CompletionProgressOut,
    ConfirmUnderstandingIn,
    LessonCommentOut,
    NextLessonOut,
    QuizHintOut,
    RequestHelpIn,
    StudentLessonOut,
    SubjectLessonOut,
    SubjectProgressOut,
    SubmitQuizIn,
    SubmitQuizOut,
    TopicLessonOut,
)

router = Router(tags=['student-lessons'], auth=CookieOrBearerJWTAuth())


def _get_owned(request: HttpRequest, student_lesson_id: int) -> StudentLesson:
    student_lesson = get_object_or_404(
        StudentLesson.objects.select_related(
            'lesson__topic__subject__school_class', 'lesson__topic__subject_block'
        ),
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
    files: list[UploadedFile] = File([]),
):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.submit_task(student_lesson, request.auth, files=files, comment=comment)
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
    files: list[UploadedFile] = File([]),
):
    require_csrf(request)
    student_lesson = _get_owned(request, student_lesson_id)
    try:
        services.resubmit(student_lesson, request.auth, files=files, comment=comment)
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
    response=SubjectProgressOut,
    operation_id='get_subject_progress',
)
def get_subject_progress(request: HttpRequest, subject_id: int):
    """Curriculum-wide (every Lesson in the subject, not just what's been
    scheduled so far — see services.compute_completion), plus the
    per-semester breakdown and matching ProgressBadge for the Subject detail
    page's course badge. See docs/interfaces/student/subjects.md."""
    student = get_own_student_profile(request)
    total_lessons = Lesson.objects.filter(topic__subject_id=subject_id).count()
    qs = StudentLesson.objects.filter(student=student, lesson__topic__subject_id=subject_id)
    completed, total, percent = services.compute_completion(total_lessons, qs)
    blocks = services.compute_block_progress(subject_id, student)
    badge = achievement_services.get_badge_for_percent(percent)
    return SubjectProgressOut(
        completed_count=completed, total_count=total, completed_percent=percent, badge=badge, blocks=blocks,
    )


@router.get(
    '/topics/{topic_id}/progress',
    response=CompletionProgressOut,
    operation_id='get_topic_progress',
)
def get_topic_progress(request: HttpRequest, topic_id: int):
    """Curriculum-wide within the topic — every Lesson under it, not just
    what's been scheduled so far. See services.compute_completion."""
    student = get_own_student_profile(request)
    total_lessons = Lesson.objects.filter(topic_id=topic_id).count()
    qs = StudentLesson.objects.filter(student=student, lesson__topic_id=topic_id)
    completed, total, percent = services.compute_completion(total_lessons, qs)
    return CompletionProgressOut(completed_count=completed, total_count=total, completed_percent=percent)


@router.get(
    '/subjects/{subject_id}/lessons',
    response=list[SubjectLessonOut],
    operation_id='list_student_subject_lessons',
)
def list_subject_lessons(request: HttpRequest, subject_id: int):
    """Every Lesson in the subject (unlike list_topic_lessons, which is
    scoped to this student's own StudentLesson rows) — powers the Subject
    detail page's Course plan so a student can see the whole curriculum,
    including lessons not assigned to them yet. Those come back with
    student_lesson_id/status set to null; the frontend renders them as
    unopenable."""
    student = get_own_student_profile(request)
    lessons = Lesson.objects.filter(topic__subject_id=subject_id).order_by('topic__order_index', 'order_index')
    student_lessons_by_lesson_id = {
        sl.lesson_id: sl
        for sl in StudentLesson.objects.filter(student=student, lesson__topic__subject_id=subject_id)
    }
    result = []
    for lesson in lessons:
        student_lesson = student_lessons_by_lesson_id.get(lesson.id)
        result.append(
            SubjectLessonOut(
                id=lesson.id,
                topic_id=lesson.topic_id,
                order_index=lesson.order_index,
                title=lesson.title,
                lesson_type=lesson.lesson_type,
                task_content=lesson.task_content,
                student_lesson_id=student_lesson.id if student_lesson else None,
                status=student_lesson.status if student_lesson else None,
                scheduled_date=student_lesson.scheduled_date if student_lesson else None,
                grade_points=student_lesson.grade_points if student_lesson else None,
                grade_result=student_lesson.grade_result if student_lesson else None,
            )
        )
    return result


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


@router.get(
    '/subjects/{subject_id}/next-lesson',
    response=NextLessonOut | None,
    operation_id='get_next_lesson',
)
def get_next_lesson(request: HttpRequest, subject_id: int):
    """The earliest not-yet-completed lesson in curriculum order — powers the
    Subject detail page's "next lesson" hero card. Returns null once every
    lesson in the subject is completed. See
    docs/interfaces/student/subjects_list.md."""
    student = get_own_student_profile(request)
    return (
        StudentLesson.objects.filter(student=student, lesson__topic__subject_id=subject_id)
        .exclude(status=StudentLessonStatus.COMPLETED)
        .select_related('lesson__topic__subject_block')
        .order_by('lesson__topic__order_index', 'lesson__order_index')
        .first()
    )
