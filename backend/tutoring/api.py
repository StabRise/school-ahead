import json
import zipfile

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.pagination import paginate

from academics import services as academics_services
from academics.models import Class, Plan, Subject, SubjectBlock, Topic
from academics.schemas import SubjectOut, TopicOut, TopicsReorderIn
from accounts.models import Avatar, AvatarItem, StudentProfile
from accounts.schemas import (
    AvatarItemOut,
    AvatarOut,
    UpdateAvatarItemTransformIn,
    UpdateAvatarTransformIn,
)
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_tutor
from lessons import services as lesson_services
from lessons.models import (
    GradingType,
    Lesson,
    LessonsJson,
    LessonType,
    StudentLesson,
    StudentLessonStatus,
)
from lessons.schemas import (
    AddCommentIn,
    LessonCommentOut,
    LessonOut,
    LessonsJsonOut,
    LessonUpdateIn,
    ProcessLessonsJsonOut,
)

from . import services
from .models import TutorSubjectAssignment
from .schemas import (
    AssignableLessonOut,
    AssignDayLessonIn,
    AssignmentOut,
    AssignStudentIn,
    GradeIn,
    ImportPlanOut,
    LessonStudentOut,
    PlanOut,
    ResolveNeedHelpIn,
    SetSubjectFilledIn,
    SetTopicBlockIn,
    SubjectLessonStudentOut,
    SubmissionDetailOut,
    TutorClassDetailOut,
    TutorClassOut,
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
        student_id=student_lesson.student_id,
        student_name=student_user.full_name or student_user.email,
        class_id=subject.school_class_id,
        class_name=subject.school_class.name,
        subject_id=subject.id,
        subject_name=subject.name,
        lesson_title=student_lesson.lesson.title,
        status=student_lesson.status,
        help_note=student_lesson.help_note,
        scheduled_date=student_lesson.scheduled_date,
        updated_at=student_lesson.updated_at,
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


def _tutor_assignments_with_counts(request: HttpRequest, **filters):
    return (
        TutorSubjectAssignment.objects.filter(tutor__user=request.auth, is_active=True, **filters)
        .select_related('subject__school_class')
        # subject__blocks: for _assignment_out's block_workloads — avoids an
        # N+1 per assignment (SubjectBlock.Meta.ordering already gives index
        # order, so no explicit Prefetch queryset needed).
        .prefetch_related('subject__blocks')
        # distinct=True on each Count separately — the subject__topics__lessons
        # join fans out per-lesson, which would otherwise inflate topic_count.
        .annotate(
            topic_count=Count('subject__topics', distinct=True),
            lesson_count=Count('subject__topics__lessons', distinct=True),
        )
    )


def _tutor_student_out(student: StudentProfile, *, class_id: int | None = None, class_name: str | None = None) -> TutorStudentOut:
    """Shared TutorStudentOut builder — `class_id`/`class_name` are only
    overridable for get_tutor_class's roster, where the caller already has
    the Class object in hand and skips select_related('school_class') on
    the student queryset."""
    return TutorStudentOut(
        id=student.id,
        name=student.user.full_name or student.user.email,
        class_id=class_id if class_id is not None else student.school_class_id,
        class_name=class_name if class_name is not None else (student.school_class.name if student.school_class else ''),
        completed_percent=float(student.completed_lessons_percent_cache),
    )


def _assignment_out(assignment: TutorSubjectAssignment, request: HttpRequest) -> AssignmentOut:
    return AssignmentOut(
        subject_id=assignment.subject_id,
        subject_name=assignment.subject.name,
        subject_icon=_absolute_file_url(assignment.subject.icon, request),
        class_id=assignment.subject.school_class_id,
        class_name=assignment.subject.school_class.name,
        topic_count=assignment.topic_count,
        lesson_count=assignment.lesson_count,
        is_filled=assignment.subject.is_filled,
        block_workloads=[block.workload for block in assignment.subject.blocks.all()],
    )


@router.get('/assignments', response=list[AssignmentOut])
def list_assignments(request: HttpRequest):
    assignments = _tutor_assignments_with_counts(request)
    return [_assignment_out(a, request) for a in assignments]


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


@router.patch('/subjects/{subject_id}/is-filled', response=SubjectOut, operation_id='set_subject_filled')
def set_subject_filled(request: HttpRequest, subject_id: int, payload: SetSubjectFilledIn):
    """Tutor-toggled flag marking a subject's curriculum as fully populated
    with lessons — purely informational, doesn't gate anything. See
    Subject.is_filled."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)
    subject.is_filled = payload.is_filled
    subject.save(update_fields=['is_filled'])
    return subject


@router.get(
    '/subjects/{subject_id}/lessons-json',
    response=list[LessonsJsonOut],
    operation_id='list_tutor_subject_lessons_json',
)
def list_subject_lessons_json(request: HttpRequest, subject_id: int):
    """Powers the "Load lessons from JSON" dialog's picker on the Subject
    detail page — every scrape_lessons upload staged for this subject,
    regardless of status (reprocessing an already-processed upload is safe —
    see lessons.services.import_topics_and_lessons)."""
    services.ensure_is_tutor_for_subject(request, subject_id)
    return LessonsJson.objects.filter(subject_id=subject_id).order_by('-created_at')


def _stage_lessons_json_from_zip(subject_id: int, name: str, description: str, file: UploadedFile) -> list[LessonsJson]:
    """One LessonsJson row per .json entry in the archive — named `name`
    plus the entry's own filename so a batch of them stays distinguishable
    in the "uploaded" step of the wizard. Skips directories, macOS junk
    (__MACOSX/, dotfiles) and anything not ending in .json."""
    with zipfile.ZipFile(file) as archive:
        entries = [
            info
            for info in archive.infolist()
            if not info.is_dir()
            and info.filename.lower().endswith('.json')
            and '__MACOSX' not in info.filename
            and not info.filename.rsplit('/', 1)[-1].startswith('.')
        ]
        if not entries:
            raise HttpError(400, 'No .json files found in the archive')

        staged = []
        for info in entries:
            entry_name = info.filename.rsplit('/', 1)[-1]
            filename_note = f'Файл: {entry_name} (з архіву {file.name})'
            full_description = f'{description}\n\n{filename_note}' if description else filename_note
            lessons_json = LessonsJson.objects.create(
                subject_id=subject_id, name=f'{name} — {entry_name}', description=full_description
            )
            lessons_json.json_file.save(entry_name, ContentFile(archive.read(info)), save=True)
            staged.append(lessons_json)
        return staged


@router.post(
    '/subjects/{subject_id}/lessons-json',
    response=list[LessonsJsonOut],
    operation_id='upload_tutor_subject_lessons_json',
)
def upload_subject_lessons_json(
    request: HttpRequest,
    subject_id: int,
    name: str = Form(...),
    description: str = Form(''),
    file: UploadedFile = File(...),
):
    """Step 1 of the "Load lessons from JSON" wizard on the Subject detail
    page — stages one or more scrape_lessons-shaped JSON uploads for later
    review and import (process_lessons_json is step 2, triggered separately
    once the tutor has looked at the file(s)). A .zip archive of .json
    files stages one row per entry (_stage_lessons_json_from_zip); a plain
    .json file stages a single row, same as before. The original
    filename(s) are appended to each row's description — upload_to renames
    files to random hex names on disk (see common/storage.py), so this is
    the only place they survive."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)

    if zipfile.is_zipfile(file):
        return _stage_lessons_json_from_zip(subject_id, name, description, file)

    filename_note = f'Файл: {file.name}'
    full_description = f'{description}\n\n{filename_note}' if description else filename_note
    return [
        LessonsJson.objects.create(
            subject_id=subject_id, name=name, description=full_description, json_file=file
        )
    ]


@router.post(
    '/lessons-json/{lessons_json_id}/process',
    response=ProcessLessonsJsonOut,
    operation_id='process_lessons_json',
)
def process_lessons_json(request: HttpRequest, lessons_json_id: int):
    require_csrf(request)
    lessons_json_obj = get_object_or_404(LessonsJson, id=lessons_json_id)
    services.ensure_is_tutor_for_subject(request, lessons_json_obj.subject_id)
    try:
        summary = lesson_services.process_lessons_json(lessons_json_obj)
    except (json.JSONDecodeError, KeyError) as exc:
        raise HttpError(400, f'Invalid lessons JSON: {exc}') from exc
    return ProcessLessonsJsonOut(
        lessons_json_id=lessons_json_obj.id,
        status=lessons_json_obj.status,
        topics_created=summary.topics_created,
        topics_reused=summary.topics_reused,
        lessons_created=len(summary.lessons_created),
        lessons_skipped=summary.lessons_skipped,
    )


@router.patch('/topics/{topic_id}/block', response=TopicOut, operation_id='set_topic_block')
def set_topic_block(request: HttpRequest, topic_id: int, payload: SetTopicBlockIn):
    """Manually moves a topic to a different SubjectBlock — see
    Topic.subject_block_manually_set and academics.services.assign_topics_to_blocks
    for how this survives later topic/block changes."""
    require_csrf(request)
    topic = get_object_or_404(Topic.objects.select_related('subject'), id=topic_id)
    services.ensure_is_tutor_for_subject(request, topic.subject_id)
    block = get_object_or_404(SubjectBlock, id=payload.subject_block_id, subject_id=topic.subject_id)
    topic.subject_block = block
    topic.subject_block_manually_set = True
    topic.save(update_fields=['subject_block', 'subject_block_manually_set'])
    return topic


@router.patch('/subjects/{subject_id}/topics/reorder', operation_id='reorder_tutor_subject_topics')
def reorder_topics(request: HttpRequest, subject_id: int, payload: TopicsReorderIn):
    """Bulk-updates Topic.order_index for the given subject — powers
    drag-and-drop topic reordering on the tutor's Subject detail page.
    Unlike academics.api.reorder_topics (admin-only), this is scoped to
    tutors assigned to the subject. Reassigning order alone can shift which
    SubjectBlock a non-pinned topic falls into (see
    academics.services.assign_topics_to_blocks) — dragging a topic to a
    different semester on the frontend follows up with set_topic_block to
    pin it there explicitly."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)
    topics_by_id = {t.id: t for t in Topic.objects.filter(subject_id=subject_id)}

    updated = []
    for item in payload.items:
        topic = topics_by_id.get(item.id)
        if topic is None:
            raise HttpError(404, f'Topic {item.id} not found in this subject')
        topic.order_index = item.order_index
        updated.append(topic)

    Topic.objects.bulk_update(updated, ['order_index'])
    academics_services.assign_topics_to_blocks(subject)
    return {'updated': len(updated)}


@router.delete('/topics/{topic_id}', operation_id='delete_tutor_topic')
def delete_topic(request: HttpRequest, topic_id: int, response: HttpResponse):
    """Deletes a Topic and every Lesson under it (Lesson.topic cascades) —
    from the tutor's Subject detail page. Unlike academics.api.delete_topic
    (admin-only), this is scoped to tutors assigned to the topic's subject."""
    require_csrf(request)
    topic = get_object_or_404(Topic.objects.select_related('subject'), id=topic_id)
    services.ensure_is_tutor_for_subject(request, topic.subject_id)
    subject = topic.subject
    topic.delete()
    academics_services.assign_topics_to_blocks(subject)
    response.status_code = 204
    return response


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


@router.patch('/lessons/{lesson_id}', response=LessonOut, operation_id='update_tutor_lesson')
def update_lesson(request: HttpRequest, lesson_id: int, payload: LessonUpdateIn):
    """Inline editing from the tutor's Lesson detail page — title, content,
    task_content, lesson_type, grading_type. Quiz questions/choices aren't
    editable here yet."""
    require_csrf(request)
    lesson = get_object_or_404(Lesson.objects.select_related('topic__subject'), id=lesson_id)
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)

    if payload.lesson_type not in LessonType.values:
        raise HttpError(400, f'Invalid lesson_type: {payload.lesson_type!r}')
    if payload.grading_type not in GradingType.values:
        raise HttpError(400, f'Invalid grading_type: {payload.grading_type!r}')

    lesson.title = payload.title
    lesson.content = payload.content
    lesson.task_content = payload.task_content
    lesson.lesson_type = payload.lesson_type
    lesson.grading_type = payload.grading_type
    lesson.save(update_fields=['title', 'content', 'task_content', 'lesson_type', 'grading_type'])
    return lesson


@router.delete('/lessons/{lesson_id}', operation_id='delete_tutor_lesson')
def delete_lesson(request: HttpRequest, lesson_id: int, response: HttpResponse):
    """Deletes a single Lesson — from the tutor's Subject detail page. Unlike
    delete_tutor_topic above, this refuses to delete a lesson that's already
    assigned to a student (any StudentLesson row, regardless of status) —
    removing it would also silently wipe that student's progress/grade."""
    require_csrf(request)
    lesson = get_object_or_404(Lesson.objects.select_related('topic__subject_block'), id=lesson_id)
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    if StudentLesson.objects.filter(lesson_id=lesson_id).exists():
        raise HttpError(409, 'Cannot delete a lesson that is assigned to a student')
    block = lesson.topic.subject_block
    lesson.delete()
    # Doesn't touch topic membership, so assign_topics_to_blocks wouldn't
    # pick up the changed lesson count — refresh the block directly.
    if block is not None:
        academics_services.recompute_block_workload(block)
    response.status_code = 204
    return response


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
            student_id=sl.student_id,
            student_name=sl.student.user.full_name or sl.student.user.email,
            scheduled_date=sl.scheduled_date,
            status=sl.status,
        )
        for sl in student_lessons
    ]


@router.get(
    '/subjects/{subject_id}/lesson-students',
    response=list[SubjectLessonStudentOut],
    operation_id='list_tutor_subject_lesson_students',
)
def list_subject_lesson_students(request: HttpRequest, subject_id: int):
    """Every lesson/student assignment across the whole subject in one call —
    powers the "full" and "student" list views on the tutor's Subject detail
    page, which need to know which students each lesson is assigned to
    without one request per lesson (see list_lesson_students for that)."""
    services.ensure_is_tutor_for_subject(request, subject_id)
    student_lessons = (
        StudentLesson.objects.filter(lesson__topic__subject_id=subject_id)
        .select_related('student__user')
        .order_by('scheduled_date', 'student__user__first_name')
    )
    return [
        SubjectLessonStudentOut(
            student_lesson_id=sl.id,
            lesson_id=sl.lesson_id,
            student_id=sl.student_id,
            student_name=sl.student.user.full_name or sl.student.user.email,
            scheduled_date=sl.scheduled_date,
            status=sl.status,
            grade_points=sl.grade_points,
            grade_result=sl.grade_result,
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
    return [_tutor_student_out(s) for s in students]


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
        student_id=student.id,
        student_name=student.user.full_name or student.user.email,
        scheduled_date=student_lesson.scheduled_date,
        status=student_lesson.status,
    )


@router.delete('/student-lessons/{student_lesson_id}', operation_id='delete_tutor_student_lesson')
def delete_student_lesson(request: HttpRequest, student_lesson_id: int, response: HttpResponse):
    """Removes a StudentLesson assignment — only while it's still Assigned
    (the student hasn't touched it yet), from a tutor's "View calendar" page
    for that student."""
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    if student_lesson.status != StudentLessonStatus.ASSIGNED:
        raise HttpError(409, 'Can only remove a lesson while it is still Assigned')
    student_lesson.delete()
    response.status_code = 204
    return response


@router.get('/students', response=list[TutorStudentOut])
def list_students(request: HttpRequest):
    students = services.get_tutor_students(request.auth)
    return [_tutor_student_out(s) for s in students]


@router.get('/students/{student_id}', response=TutorStudentOut, operation_id='get_tutor_student')
def get_student(request: HttpRequest, student_id: int):
    """Powers the "View calendar" page's breadcrumb/header — the roster
    itself (get_tutor_class) already has this, this is for navigating there
    directly by student_id."""
    student = get_object_or_404(StudentProfile.objects.select_related('user', 'school_class'), id=student_id)
    services.ensure_is_tutor_for_class(request, student.school_class_id)
    return _tutor_student_out(student)


@router.get(
    '/students/{student_id}/subjects',
    response=list[AssignmentOut],
    operation_id='list_student_subjects',
)
def list_student_subjects(request: HttpRequest, student_id: int):
    """Subjects this tutor teaches in the student's class — powers the
    subject picker in the calendar day's "+" popup (tutoring.api.assign_day_lesson)."""
    student = get_object_or_404(StudentProfile, id=student_id)
    services.ensure_is_tutor_for_class(request, student.school_class_id)
    assignments = _tutor_assignments_with_counts(request, subject__school_class_id=student.school_class_id)
    return [_assignment_out(a, request) for a in assignments]


@router.get(
    '/students/{student_id}/subjects/{subject_id}/assignable-lessons',
    response=list[AssignableLessonOut],
    operation_id='list_student_assignable_lessons',
)
def list_student_assignable_lessons(request: HttpRequest, student_id: int, subject_id: int):
    """Lessons in this subject the student doesn't already have, in
    curriculum order — the "existing lesson" picker in the calendar day's
    "+" popup, once is_new is unchecked."""
    student = get_object_or_404(StudentProfile, id=student_id)
    services.ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id, school_class_id=student.school_class_id)
    assigned_lesson_ids = StudentLesson.objects.filter(
        student_id=student_id, lesson__topic__subject_id=subject.id
    ).values_list('lesson_id', flat=True)
    lessons = (
        Lesson.objects.filter(topic__subject_id=subject.id)
        .exclude(id__in=assigned_lesson_ids)
        .select_related('topic')
        .order_by('topic__order_index', 'order_index')
    )
    return [
        AssignableLessonOut(id=l.id, title=l.title, topic_title=l.topic.title, lesson_type=l.lesson_type)
        for l in lessons
    ]


@router.post(
    '/students/{student_id}/day-lessons',
    response=LessonStudentOut,
    operation_id='assign_day_lesson',
)
def assign_day_lesson(request: HttpRequest, student_id: int, payload: AssignDayLessonIn):
    """The calendar day's "+" popup, submitted — assigns a lesson to
    `student` on `payload.scheduled_date`. is_new=false assigns an existing
    not-yet-assigned lesson (payload.lesson_id); is_new=true first creates a
    one-off lesson under the subject's "Extra" topic (see
    lesson_services.create_extra_lesson) from payload.title/content/task_content."""
    require_csrf(request)
    student = get_object_or_404(StudentProfile.objects.select_related('user'), id=student_id)
    services.ensure_is_tutor_for_subject(request, payload.subject_id)
    subject = get_object_or_404(Subject, id=payload.subject_id, school_class_id=student.school_class_id)

    if payload.is_new:
        if not payload.title or not payload.content:
            raise HttpError(400, 'title and content are required when is_new is true')
        lesson = lesson_services.create_extra_lesson(
            subject, title=payload.title, content=payload.content, task_content=payload.task_content
        )
    else:
        if payload.lesson_id is None:
            raise HttpError(400, 'lesson_id is required when is_new is false')
        lesson = get_object_or_404(Lesson, id=payload.lesson_id, topic__subject_id=subject.id)

    try:
        student_lesson = lesson_services.assign_student(lesson, student, payload.scheduled_date)
    except lesson_services.InvalidTransition as exc:
        raise HttpError(409, str(exc)) from exc

    return LessonStudentOut(
        student_lesson_id=student_lesson.id,
        student_id=student.id,
        student_name=student.user.full_name or student.user.email,
        scheduled_date=student_lesson.scheduled_date,
        status=student_lesson.status,
    )


def _class_teacher_name(school_class: Class) -> str | None:
    class_teacher = school_class.class_teacher
    if class_teacher is None:
        return None
    return class_teacher.user.full_name or class_teacher.user.email


def _tutor_class_out(school_class: Class, request: HttpRequest, subject_ids) -> TutorClassOut:
    tutor_profile = getattr(request.auth, 'tutor_profile', None)
    return TutorClassOut(
        id=school_class.id,
        name=school_class.name,
        academic_year=school_class.academic_year,
        class_teacher_name=_class_teacher_name(school_class),
        is_class_teacher=tutor_profile is not None and school_class.class_teacher_id == tutor_profile.id,
        student_count=school_class.students.count(),
        subject_count=Subject.objects.filter(school_class=school_class, id__in=subject_ids).count(),
    )


@router.get('/classes', response=list[TutorClassOut], operation_id='list_tutor_classes')
def list_tutor_classes(request: HttpRequest):
    """Classes reachable through the tutor's subject assignments — powers
    the "Мої класи" page. student_count is the whole class roster;
    subject_count is only the subjects *this* tutor teaches there (matching
    the grouping on the "Мої предмети" page), not the class's total."""
    subject_ids = list(services.get_tutor_subject_ids(request.auth))
    classes = (
        Class.objects.filter(id__in=services.get_tutor_class_ids(request.auth))
        .select_related('class_teacher__user')
        .order_by('order_index')
    )
    return [_tutor_class_out(school_class, request, subject_ids) for school_class in classes]


@router.get('/classes/{class_id}', response=TutorClassDetailOut, operation_id='get_tutor_class')
def get_tutor_class(request: HttpRequest, class_id: int):
    """Class detail for the "Мої класи" page's drill-down: the class summary
    plus its full student roster and the subjects *this* tutor teaches
    there."""
    services.ensure_is_tutor_for_class(request, class_id)
    school_class = get_object_or_404(Class.objects.select_related('class_teacher__user'), id=class_id)
    subject_ids = list(services.get_tutor_subject_ids(request.auth))

    students = school_class.students.select_related('user').order_by('user__first_name', 'user__last_name')
    assignments = _tutor_assignments_with_counts(request, subject__school_class_id=class_id)

    summary = _tutor_class_out(school_class, request, subject_ids)
    return TutorClassDetailOut(
        **summary.dict(),
        students=[
            _tutor_student_out(s, class_id=class_id, class_name=school_class.name) for s in students
        ],
        subjects=[_assignment_out(a, request) for a in assignments],
    )


@router.post('/classes/{class_id}/recalculate-workload', operation_id='recalculate_class_workload')
def recalculate_class_workload(request: HttpRequest, class_id: int):
    """Refreshes weeks_count/workload for every SubjectBlock across the
    subjects *this* tutor teaches in the class — the "Перерахувати
    навантаження" button on the class detail page. Doesn't touch
    topic->block membership (see academics.services.assign_topics_to_blocks
    for that)."""
    require_csrf(request)
    services.ensure_is_tutor_for_class(request, class_id)
    assignments = _tutor_assignments_with_counts(request, subject__school_class_id=class_id)
    recalculated = sum(academics_services.recompute_subject_workloads(a.subject) for a in assignments)
    return {'recalculated': recalculated}


@router.get('/classes/{class_id}/plans', response=list[PlanOut], operation_id='list_tutor_class_plans')
def list_class_plans(request: HttpRequest, class_id: int):
    """Past curriculum-plan uploads for this class — the "Завантажити план"
    wizard's history on the Class detail page. Same restriction as
    uploading it (ensure_is_class_teacher): a class teacher with no
    TutorSubjectAssignment of their own in the class yet (e.g. every
    subject already existed before they took over) would otherwise fail
    ensure_is_tutor_for_class despite being allowed to upload."""
    services.ensure_is_class_teacher(request, class_id)
    return Plan.objects.filter(school_class_id=class_id).order_by('-created_at')


@router.post('/classes/{class_id}/plans', response=ImportPlanOut, operation_id='upload_tutor_class_plan')
def upload_class_plan(request: HttpRequest, class_id: int, file: UploadedFile = File(...)):
    """The "Завантажити план" wizard on the Class detail page — uploads a
    curriculum-plan text file and immediately parses+imports it (see
    academics.services.parse_plan_text/import_class_plan): get_or_creates a
    Subject per parsed section (matched case-insensitively within the
    class) and its SubjectBlocks, overwriting each matching block's
    description with the section's text. Restricted to the class's
    homeroom teacher (ensure_is_class_teacher) — not just any tutor
    assigned to a subject in the class."""
    require_csrf(request)
    services.ensure_is_class_teacher(request, class_id)
    school_class = get_object_or_404(Class, id=class_id)

    try:
        text = file.read().decode('utf-8')
    except UnicodeDecodeError as exc:
        raise HttpError(400, f'File must be UTF-8 text: {exc}') from exc

    sections = academics_services.parse_plan_text(text)
    if not sections:
        raise HttpError(400, 'No "Subject name / N семестр / …" sections found in the file')

    semester_indexes = sorted({section.semester_index for section in sections})
    semester_name = ', '.join(f'Semester {i}' for i in semester_indexes)

    with transaction.atomic():
        plan = Plan.objects.create(school_class=school_class, semester_name=semester_name, text=text)
        summary = academics_services.import_class_plan(school_class, sections)

    return ImportPlanOut(
        plan_id=plan.id,
        semester_name=semester_name,
        subjects_found=summary.subjects_found,
        subjects_added=summary.subjects_added,
        blocks_updated=summary.blocks_updated,
    )


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
            'student_id': student_lesson.student_id,
            'student_name': student_user.full_name or student_user.email,
            'class_id': subject.school_class_id,
            'class_name': subject.school_class.name,
            'subject_id': subject.id,
            'subject_name': subject.name,
            'lesson_id': student_lesson.lesson_id,
            'lesson_title': student_lesson.lesson.title,
            'status': student_lesson.status,
            'grading_type': student_lesson.lesson.grading_type,
            'help_note': student_lesson.help_note,
            'task_content': student_lesson.lesson.task_content,
            'scheduled_date': student_lesson.scheduled_date,
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
def request_revision(
    request: HttpRequest,
    student_lesson_id: int,
    feedback: str = Form(''),
    images: list[UploadedFile] = File([]),
):
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    try:
        lesson_services.request_revision(student_lesson, request.auth, feedback, images=images)
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


def _tutor_avatar_item_out(item: AvatarItem, request: HttpRequest) -> AvatarItemOut:
    image_url = request.build_absolute_uri(item.image.url) if item.image else None
    return AvatarItemOut(
        id=item.id,
        slot=item.slot,
        key=item.key,
        name=item.name,
        image=image_url,
        scale=item.scale,
        offset_x=item.offset_x,
        offset_y=item.offset_y,
        layer_order=item.layer_order,
        price=item.price,
        is_unlocked=True,
    )


def _tutor_avatar_out(avatar: Avatar, request: HttpRequest) -> AvatarOut:
    image_url = request.build_absolute_uri(avatar.image.url) if avatar.image else None
    items = [_tutor_avatar_item_out(item, request) for item in avatar.items.all()]
    return AvatarOut(id=avatar.id, key=avatar.key, name=avatar.name, image=image_url, scale=avatar.scale, items=items)


@router.get('/avatars', response=list[AvatarOut], operation_id='list_tutor_avatars')
def list_tutor_avatars(request: HttpRequest):
    """The full avatar catalog (every item, active or not) with its
    scale/offset fine-tuning — powers the avatar editor page. See
    docs/core/avatar.md."""
    ensure_is_tutor(request)
    return [_tutor_avatar_out(avatar, request) for avatar in Avatar.objects.all()]


@router.patch('/avatars/{avatar_id}', response=AvatarOut, operation_id='update_tutor_avatar_transform')
def update_tutor_avatar_transform(request: HttpRequest, avatar_id: int, payload: UpdateAvatarTransformIn):
    """Sets a companion body's size multiplier — see Avatar.scale."""
    require_csrf(request)
    ensure_is_tutor(request)
    avatar = get_object_or_404(Avatar, id=avatar_id)
    avatar.scale = payload.scale
    avatar.save(update_fields=['scale'])
    return _tutor_avatar_out(avatar, request)


@router.patch('/avatar-items/{item_id}', response=AvatarItemOut, operation_id='update_tutor_avatar_item_transform')
def update_tutor_avatar_item_transform(request: HttpRequest, item_id: int, payload: UpdateAvatarItemTransformIn):
    """Sets a wardrobe item's size/position fine-tuning, clothing stacking
    order, and Diamond shop price — see
    AvatarItem.scale/offset_x/offset_y/layer_order/price."""
    require_csrf(request)
    ensure_is_tutor(request)
    item = get_object_or_404(AvatarItem, id=item_id)
    item.scale = payload.scale
    item.offset_x = payload.offset_x
    item.offset_y = payload.offset_y
    item.layer_order = payload.layer_order
    item.price = payload.price
    item.save(update_fields=['scale', 'offset_x', 'offset_y', 'layer_order', 'price'])
    return _tutor_avatar_item_out(item, request)
