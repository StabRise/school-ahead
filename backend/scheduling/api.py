import datetime

from academics.models import Class, Subject
from accounts.models import StudentProfile
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import get_own_student_profile
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from lessons import services as lesson_services
from lessons.models import StudentLesson
from ninja import Router
from ninja.errors import HttpError
from tutoring.services import (
    ensure_is_tutor_for_class,
    ensure_is_tutor_for_subject,
    get_tutor_subject_ids,
)

from . import services
from .schemas import (
    BacklogItemOut,
    CalendarItemOut,
    GenerateCalendarOut,
    GenerateClassScheduleIn,
    GenerateClassScheduleOut,
    RescheduleIn,
    TodayOut,
)

router = Router(tags=['schedule'], auth=CookieOrBearerJWTAuth())


def _absolute_file_url(file_field, request: HttpRequest) -> str | None:
    """See lessons/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    return request.build_absolute_uri(file_field.url)


def _calendar_item(request: HttpRequest, student_lesson: StudentLesson) -> CalendarItemOut:
    is_ahead = bool(
        student_lesson.completed_at
        and student_lesson.completed_at.date() < student_lesson.scheduled_date
    )
    subject = student_lesson.lesson.topic.subject
    return CalendarItemOut(
        id=student_lesson.id,
        lesson_id=student_lesson.lesson_id,
        subject_id=subject.id,
        lesson_title=student_lesson.lesson.title,
        topic_title=student_lesson.lesson.topic.title,
        subject_name=subject.name,
        status=student_lesson.status,
        scheduled_date=student_lesson.scheduled_date,
        completed_at=student_lesson.completed_at,
        is_completed_ahead=is_ahead,
        grade_points=student_lesson.grade_points,
        lesson_icon=_absolute_file_url(student_lesson.lesson.icon, request),
        subject_icon=_absolute_file_url(subject.icon, request),
    )


def _backlog_item(request: HttpRequest, student_lesson: StudentLesson) -> BacklogItemOut:
    base = _calendar_item(request, student_lesson)
    return BacklogItemOut(**base.dict(), origin_label=services.backlog_label(student_lesson))


@router.get('/calendar', response=list[CalendarItemOut])
def calendar(request: HttpRequest, week_start: datetime.date):
    student = get_own_student_profile(request)
    items = services.get_week_calendar(student, week_start)
    return [_calendar_item(request, sl) for sl in items]


@router.get('/today', response=TodayOut, operation_id='get_today')
def today(request: HttpRequest, date: datetime.date):
    student = get_own_student_profile(request)
    today_lessons, backlog_lessons = services.get_today(student, date)
    return TodayOut(
        today=[_calendar_item(request, sl) for sl in today_lessons],
        backlog=[_backlog_item(request, sl) for sl in backlog_lessons],
    )


@router.get('/backlog', response=list[BacklogItemOut])
def backlog(request: HttpRequest):
    student = get_own_student_profile(request)
    items = services.get_backlog(student, datetime.date.today())
    return [_backlog_item(request, sl) for sl in items]


@router.get(
    '/students/{student_id}/calendar',
    response=list[CalendarItemOut],
    operation_id='get_tutor_student_calendar',
)
def student_calendar(request: HttpRequest, student_id: int, week_start: datetime.date):
    """A tutor viewing one of their students' weekly calendar — see the
    "View calendar" link on the class detail page's roster. Scoped the same
    way as the roster itself (get_tutor_class): any subject in the
    student's class is enough, not just the ones this tutor teaches."""
    student = get_object_or_404(StudentProfile, id=student_id)
    ensure_is_tutor_for_class(request, student.school_class_id)
    items = services.get_week_calendar(student, week_start)
    return [_calendar_item(request, sl) for sl in items]


@router.get(
    '/students/{student_id}/backlog',
    response=list[BacklogItemOut],
    operation_id='get_tutor_student_backlog',
)
def student_backlog(request: HttpRequest, student_id: int):
    student = get_object_or_404(StudentProfile, id=student_id)
    ensure_is_tutor_for_class(request, student.school_class_id)
    items = services.get_backlog(student, datetime.date.today())
    return [_backlog_item(request, sl) for sl in items]


@router.post('/subjects/{subject_id}/generate-calendar', response=GenerateCalendarOut)
def generate_calendar(request: HttpRequest, subject_id: int):
    require_csrf(request)
    ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)
    result = services.generate_calendar_for_subject(subject)
    return GenerateCalendarOut(**result)


@router.post('/subjects/{subject_id}/recalculate-calendar', response=GenerateCalendarOut)
def recalculate_calendar(request: HttpRequest, subject_id: int):
    require_csrf(request)
    ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)
    result = services.generate_calendar_for_subject(subject)
    return GenerateCalendarOut(**result)


@router.post('/classes/{class_id}/generate-schedule', response=GenerateClassScheduleOut)
def generate_class_schedule(request: HttpRequest, class_id: int, payload: GenerateClassScheduleIn):
    """The tutor's "Plan Lessons" modal — see
    scheduling.services.generate_class_schedule for the algorithm."""
    require_csrf(request)
    ensure_is_tutor_for_class(request, class_id)
    if payload.start_date > payload.end_date:
        raise HttpError(400, 'start_date must not be after end_date')

    school_class = get_object_or_404(Class, id=class_id)

    requested = {item.subject_id: item.lessons_count for item in payload.subjects if item.lessons_count > 0}
    tutor_subject_ids = set(get_tutor_subject_ids(request.auth))
    if not set(requested) <= tutor_subject_ids:
        raise HttpError(403, 'Not a tutor for one or more of the given subjects')
    valid_subject_ids = set(
        Subject.objects.filter(id__in=requested, school_class_id=class_id).values_list('id', flat=True)
    )
    if set(requested) != valid_subject_ids:
        raise HttpError(400, 'One or more subjects do not belong to this class')

    result = services.generate_class_schedule(school_class, payload.start_date, payload.end_date, requested)
    return GenerateClassScheduleOut(**result)


@router.post('/student-lessons/{student_lesson_id}/reschedule', response=CalendarItemOut)
def reschedule(request: HttpRequest, student_lesson_id: int, payload: RescheduleIn):
    require_csrf(request)
    student_lesson = get_object_or_404(StudentLesson, id=student_lesson_id)
    ensure_is_tutor_for_subject(request, student_lesson.lesson.topic.subject_id)
    try:
        lesson_services.reschedule(student_lesson, payload.scheduled_date)
    except lesson_services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc
    return _calendar_item(request, student_lesson)
