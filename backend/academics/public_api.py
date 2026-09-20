"""Read-only endpoints for visitors who aren't signed in.

Everything here is served without authentication, so it is an explicit
allowlist rather than the authenticated routers' "any signed-in user may
read": a subject or lesson is only reachable when its class has
Class.is_public set (`_public_subjects`), and a lesson comes back as content
only — no StudentLesson, quiz, comments or favourites, all of which need a
signed-in student (see lessons.api). Every lookup 404s for a class that isn't
public, the same as for an id that doesn't exist, so the API doesn't reveal
which private subjects exist. See docs/core/public_access.md.
"""

from django.db.models import Count, Exists, OuterRef, QuerySet
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Query, Router

from lessons import services as lesson_services
from lessons.api import lesson_preview_out, lessons_page_out, subject_lessons_out
from lessons.models import Lesson
from lessons.schemas import LessonPreviewOut, LessonTopicOut, SubjectLessonOut, SubjectLessonPageOut

from .models import Subject, Topic
from .schemas import PublicSubjectOut, TopicOut

router = Router(tags=['public'], auth=None)


def _public_subjects() -> QuerySet[Subject]:
    return Subject.objects.filter(school_class__is_public=True)


@router.get('/subjects', response=list[PublicSubjectOut], operation_id='list_public_subjects')
def list_public_subjects(request: HttpRequest):
    """Every subject of every public class that has at least one lesson (a
    book with nothing in it isn't worth showing) — the signed-out
    counterpart of academics.api.my_subjects?has_lessons=true."""
    return (
        _public_subjects()
        .filter(Exists(Topic.objects.filter(subject=OuterRef('pk'), lessons__isnull=False)))
        .order_by('school_class__order_index', 'order_index', 'id')
    )


@router.get('/subjects/{subject_id}', response=PublicSubjectOut, operation_id='get_public_subject')
def get_public_subject(request: HttpRequest, subject_id: int):
    return get_object_or_404(_public_subjects(), id=subject_id)


@router.get('/subjects/{subject_id}/topics', response=list[TopicOut], operation_id='list_public_subject_topics')
def list_public_subject_topics(request: HttpRequest, subject_id: int):
    subject = get_object_or_404(_public_subjects(), id=subject_id)
    return Topic.objects.filter(subject=subject).select_related('subject_block').annotate(lesson_total=Count('lessons'))


@router.get(
    '/subjects/{subject_id}/lessons',
    response=list[SubjectLessonOut],
    operation_id='list_public_subject_lessons',
)
def list_public_subject_lessons(request: HttpRequest, subject_id: int):
    """Every lesson of the subject in curriculum order, shaped like
    lessons.api.list_subject_lessons but with every student_* field null —
    a visitor has no StudentLesson."""
    subject = get_object_or_404(_public_subjects(), id=subject_id)
    return subject_lessons_out(subject.id, {}, request)


@router.get(
    '/subjects/{subject_id}/lesson-topics',
    response=list[LessonTopicOut],
    operation_id='list_public_subject_lesson_topics',
)
def list_public_subject_lesson_topics(request: HttpRequest, subject_id: int):
    """The tabs of the subject page: the topics that have lessons, each with
    how many — a visitor sees every lesson, so there is no filter."""
    subject = get_object_or_404(_public_subjects(), id=subject_id)
    return lesson_services.lesson_topic_tabs(lesson_services.visible_subject_lessons(subject.id, None, 'all'))


@router.get(
    '/subjects/{subject_id}/lessons-page',
    response=SubjectLessonPageOut,
    operation_id='list_public_subject_lessons_page',
)
def list_public_subject_lessons_page(
    request: HttpRequest,
    subject_id: int,
    topic_id: int,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """A page of one topic's lessons — the subject page's grid, loaded `limit`
    at a time as the visitor scrolls, like lessons.api.list_student_subject_lessons_page."""
    subject = get_object_or_404(_public_subjects(), id=subject_id)
    lessons = lesson_services.visible_subject_lessons(subject.id, None, 'all').filter(topic_id=topic_id)
    return lessons_page_out(lessons, None, limit, offset, request)


@router.get('/lessons/{lesson_id}', response=LessonPreviewOut, operation_id='get_public_lesson')
def get_public_lesson(request: HttpRequest, lesson_id: int):
    """The lesson's content, read-only — the same payload a student gets from
    lessons.api.preview_lesson, with student_lesson_id always null."""
    lesson = get_object_or_404(
        Lesson.objects.select_related('topic__subject', 'topic__subject_block'),
        id=lesson_id,
        topic__subject__in=_public_subjects(),
    )
    return lesson_preview_out(lesson, None, request)
