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
from academics.models import Class, Plan, Subject, SubjectBlock, SubjectGroup, Topic
from academics.schemas import SubjectOut, SubjectsReorderIn, TopicOut, TopicsReorderIn
from accounts import services as accounts_services
from accounts.models import Avatar, AvatarItem, StudentProfile
from accounts.schemas import (
    AvatarItemOut,
    AvatarOut,
    UpdateAvatarItemArtworkIn,
    UpdateAvatarItemTransformIn,
    UpdateAvatarTransformIn,
)
from achievements import services as achievements_services
from achievements.schemas import SubjectAchievementOut
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_tutor
from house import services as house_services
from house.models import FurnitureItem, FurnitureSurface, FurnitureTexture
from house.schemas import FurnitureTextureOut
from lessons import services as lesson_services
from lessons import youtube_scrape
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
    LessonCreateIn,
    LessonOut,
    LessonsJsonOut,
    LessonsReorderIn,
    LessonUpdateIn,
    ProcessLessonsJsonOut,
    UpdateLessonIconsOut,
    YoutubeImportIn,
    YoutubeImportOut,
)

from . import services
from .models import TutorSubjectAssignment
from .schemas import (
    AssignableLessonOut,
    AssignDayLessonIn,
    AssignmentOut,
    AssignStudentIn,
    CreateSubjectIn,
    GradeIn,
    ImportPlanOut,
    ImportSubjectMarkdownOut,
    LessonStudentOut,
    NeedReviewLessonOut,
    PlanOut,
    ResolveNeedHelpIn,
    SetNeedReviewIn,
    SetCanDoAnyLessonIn,
    SetSubjectAttestationTypeIn,
    SetSubjectFilledIn,
    SetTopicBlockIn,
    SubjectLessonStudentOut,
    SubjectMarkdownLessonOut,
    SubjectMarkdownTopicOut,
    SubmissionDetailOut,
    TutorClassDetailOut,
    TutorClassOut,
    TutorFeedItemOut,
    TutorFurnitureItemOut,
    TutorStudentOut,
    UpdateSubjectIn,
    UpdateTutorFurnitureItemIn,
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
        .select_related('subject__school_class', 'subject__group')
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


def _tutor_student_out(
    student: StudentProfile,
    request: HttpRequest,
    *,
    class_id: int | None = None,
    class_name: str | None = None,
    with_avatar: bool = False,
) -> TutorStudentOut:
    """Shared TutorStudentOut builder — `class_id`/`class_name` are only
    overridable for get_tutor_class's roster, where the caller already has
    the Class object in hand and skips select_related('school_class') on
    the student queryset. `with_avatar` composites the student's equipped
    avatar/wardrobe (same builders accounts.api._user_out uses for UserOut)
    — only worth the extra queries for get_student's single-object page, so
    every list endpoint sharing this builder leaves it off."""
    unlocked_ids = set(student.unlocked_items.values_list('id', flat=True)) if with_avatar else None
    # Computed once (not once per slot) since stacking order is global
    # across all three slots — see accounts.services.equipped_items_out.
    equipped = (
        accounts_services.equipped_items_out(student, request, unlocked_ids)
        if with_avatar
        else {'clothing': [], 'headwear': [], 'accessory': []}
    )
    return TutorStudentOut(
        id=student.id,
        name=student.user.full_name or student.user.email,
        class_id=class_id if class_id is not None else student.school_class_id,
        class_name=class_name if class_name is not None else (student.school_class.name if student.school_class else ''),
        completed_percent=float(student.completed_lessons_percent_cache),
        avatar_url=student.user.avatar_url,
        equipped_avatar=accounts_services.avatar_out(student.equipped_avatar, request, unlocked_ids)
        if with_avatar
        else None,
        equipped_clothing_items=equipped['clothing'],
        equipped_headwear_items=equipped['headwear'],
        equipped_accessory_items=equipped['accessory'],
        can_do_any_lesson=student.can_do_any_lesson,
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
        group_id=assignment.subject.group_id,
        group_name=assignment.subject.group.name if assignment.subject.group_id else None,
        order_index=assignment.subject.order_index,
        attestation_type=assignment.subject.attestation_type,
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


MAX_SUBJECT_ICON_BYTES = 5 * 1024 * 1024


@router.patch('/subjects/{subject_id}', response=SubjectOut, operation_id='update_tutor_subject')
def update_tutor_subject(request: HttpRequest, subject_id: int, payload: UpdateSubjectIn):
    """Inline rename of a subject from its own detail page. Unlike
    academics.api.patch_subject (staff-only, dates/blocks/group), this is
    scoped to tutors assigned to the subject and only touches the name."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    name = payload.name.strip()
    if not name:
        raise HttpError(400, 'Subject name must not be blank')
    subject = get_object_or_404(Subject.objects.select_related('school_class', 'group'), id=subject_id)
    subject.name = name
    subject.save(update_fields=['name'])
    return subject


@router.post('/subjects/{subject_id}/icon', response=SubjectOut, operation_id='upload_tutor_subject_icon')
def upload_tutor_subject_icon(request: HttpRequest, subject_id: int, file: UploadedFile = File(...)):
    """Sets (or replaces) a subject's icon from an uploaded image — the
    clickable icon beside the title on the Subject detail page. The
    previous file is deleted so replacing doesn't leave orphans in storage."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    if not (file.content_type or '').startswith('image/'):
        raise HttpError(400, 'Only image files are supported')
    if file.size > MAX_SUBJECT_ICON_BYTES:
        raise HttpError(400, 'Image is too large (max 5 MB)')

    subject = get_object_or_404(Subject.objects.select_related('school_class', 'group'), id=subject_id)
    previous_icon = subject.icon.name
    subject.icon.save(file.name, file, save=True)
    if previous_icon:
        subject.icon.storage.delete(previous_icon)
    return subject


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


@router.patch(
    '/subjects/{subject_id}/attestation-type', response=SubjectOut, operation_id='set_subject_attestation_type'
)
def set_subject_attestation_type(request: HttpRequest, subject_id: int, payload: SetSubjectAttestationTypeIn):
    """Tutor-set flag for how a subject is formally assessed at the end of
    the year — purely informational, doesn't gate anything. See
    Subject.attestation_type."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)
    subject.attestation_type = payload.attestation_type
    subject.save(update_fields=['attestation_type'])
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


@router.post(
    '/subjects/{subject_id}/youtube-import',
    response=YoutubeImportOut,
    operation_id='import_tutor_subject_youtube_playlist',
)
def import_subject_youtube_playlist(request: HttpRequest, subject_id: int, payload: YoutubeImportIn):
    """The "📥 Завантажити з YouTube" popup on the Subject detail page —
    scrapes a public YouTube playlist (same algorithm as manage.py's
    tmp_scrape_lessons -Y, see lessons.youtube_scrape) straight into one
    Topic (get_or_created by `payload.topic_name`, or by the playlist's own
    title when that's blank) with
    one theory Lesson per video, via the same import_topics_and_lessons the
    JSON-upload flow uses above — so re-running this against the same
    playlist (or a playlist that grew new videos) only adds what's
    genuinely new instead of duplicating lessons."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)

    try:
        topic_data, truncated = youtube_scrape.fetch_playlist_topic(payload.playlist_url, payload.topic_name)
    except youtube_scrape.ScrapeError as exc:
        raise HttpError(400, str(exc)) from exc

    with transaction.atomic():
        summary = lesson_services.import_topics_and_lessons(subject, [topic_data])

    # Outside the transaction — these are network calls to fetch each
    # video's thumbnail (see lesson_services.set_lesson_icons_from_content),
    # and a failed download just leaves that lesson's icon empty rather than
    # rolling back the whole import.
    lesson_services.set_lesson_icons_from_content(summary.lessons_created)

    return YoutubeImportOut(
        topic_id=summary.topics[0].id,
        topic_name=summary.topics[0].title,
        lessons_created=len(summary.lessons_created),
        lessons_skipped=summary.lessons_skipped,
        truncated=truncated,
    )


@router.post(
    '/subjects/{subject_id}/update-lesson-icons',
    response=UpdateLessonIconsOut,
    operation_id='update_tutor_subject_lesson_icons',
)
def update_subject_lesson_icons(request: HttpRequest, subject_id: int):
    """The icon button on the Subject detail page's Lessons toolbar — sets
    every lesson's icon to the thumbnail of the first YouTube video linked
    from its content (see lesson_services.update_subject_lesson_icons)."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)
    summary = lesson_services.update_subject_lesson_icons(subject)
    return UpdateLessonIconsOut(
        updated=summary.updated, skipped=summary.skipped, already_had_icon=summary.already_had_icon
    )


@router.post(
    '/topics/{topic_id}/update-lesson-icons',
    response=UpdateLessonIconsOut,
    operation_id='update_tutor_topic_lesson_icons',
)
def update_topic_lesson_icons(request: HttpRequest, topic_id: int):
    """Same as update_subject_lesson_icons above, scoped to one Topic — the
    icon button on the Subject detail page's per-topic header."""
    require_csrf(request)
    topic = get_object_or_404(Topic.objects.select_related('subject'), id=topic_id)
    services.ensure_is_tutor_for_subject(request, topic.subject_id)
    summary = lesson_services.update_topic_lesson_icons(topic)
    return UpdateLessonIconsOut(
        updated=summary.updated, skipped=summary.skipped, already_had_icon=summary.already_had_icon
    )


@router.post(
    '/lessons/{lesson_id}/update-icon',
    response=UpdateLessonIconsOut,
    operation_id='update_tutor_lesson_icon',
)
def update_lesson_icon(request: HttpRequest, lesson_id: int):
    """Same as update_subject_lesson_icons above, for one Lesson — the
    "load image" button on a lesson's tile in the Preschool Preview tab.
    `skipped` is 1 (updated 0) when the lesson's content has no YouTube link
    or the thumbnail couldn't be downloaded."""
    require_csrf(request)
    lesson = get_object_or_404(Lesson.objects.select_related('topic'), id=lesson_id)
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    updated = lesson_services.set_lesson_icon_from_content(lesson)
    return UpdateLessonIconsOut(updated=int(updated), skipped=int(not updated))


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


@router.patch('/subjects/{subject_id}/lessons/reorder', operation_id='reorder_tutor_subject_lessons')
def reorder_lessons(request: HttpRequest, subject_id: int, payload: LessonsReorderIn):
    """Bulk-updates Lesson.topic/order_index for the given subject — powers
    both drag-and-drop lesson reordering within a topic and moving a lesson
    to a different topic on the tutor's Subject detail page. The frontend
    always sends the complete, renumbered lesson list for every topic a drag
    touched (the target topic, and the source topic too when it differs),
    not the whole subject.

    Unlike Topic (see reorder_topics above), Lesson has
    unique_together = [('topic', 'order_index')] — a straight bulk_update to
    final values can hit that constraint mid-batch when two rows' target
    values collide with each other's current value. Phase 1 below moves
    every touched lesson to a scratch order_index strictly above the
    current max across all touched topics, so it can't collide with any
    sibling; phase 2 then bulk_updates to the final topic/order_index."""
    require_csrf(request)
    services.ensure_is_tutor_for_subject(request, subject_id)

    lessons_by_id = {
        lesson.id: lesson
        for lesson in Lesson.objects.filter(topic__subject_id=subject_id).select_related('topic__subject_block')
    }
    topics_by_id = {t.id: t for t in Topic.objects.filter(subject_id=subject_id).select_related('subject_block')}

    updated: list[Lesson] = []
    affected_blocks: dict[int, SubjectBlock] = {}
    touched_topic_ids: set[int] = set()

    for item in payload.items:
        lesson = lessons_by_id.get(item.id)
        if lesson is None:
            raise HttpError(404, f'Lesson {item.id} not found in this subject')
        topic = topics_by_id.get(item.topic_id)
        if topic is None:
            raise HttpError(404, f'Topic {item.topic_id} not found in this subject')

        touched_topic_ids.add(lesson.topic_id)
        touched_topic_ids.add(item.topic_id)
        if lesson.topic_id != item.topic_id:
            if lesson.topic.subject_block is not None:
                affected_blocks[lesson.topic.subject_block_id] = lesson.topic.subject_block
            if topic.subject_block is not None:
                affected_blocks[topic.subject_block_id] = topic.subject_block
            lesson.topic = topic
        updated.append(lesson)

    # Phase 1: scratch order_index, strictly above any current value in any
    # touched topic, so no (topic, order_index) pair can collide mid-batch.
    current_max = (
        Lesson.objects.filter(topic_id__in=touched_topic_ids)
        .order_by('-order_index')
        .values_list('order_index', flat=True)
        .first()
    ) or 0
    for offset, lesson in enumerate(updated, start=1):
        lesson.order_index = current_max + offset
    Lesson.objects.bulk_update(updated, ['order_index'])

    # Phase 2: final topic + order_index.
    for item, lesson in zip(payload.items, updated):
        lesson.order_index = item.order_index
    Lesson.objects.bulk_update(updated, ['topic', 'order_index'])

    for block in affected_blocks.values():
        academics_services.recompute_block_workload(block)

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


@router.post('/lessons', response=LessonOut, operation_id='create_tutor_lesson')
def create_lesson(request: HttpRequest, payload: LessonCreateIn):
    """Manually adding a single lesson to an existing topic — the tutor's
    "+" button on a topic section (Subject detail page). Appended at the
    end of the topic, same order_index rule as duplicate_lesson."""
    require_csrf(request)
    if payload.lesson_type not in LessonType.values:
        raise HttpError(400, f'Invalid lesson_type: {payload.lesson_type!r}')
    if payload.grading_type not in GradingType.values:
        raise HttpError(400, f'Invalid grading_type: {payload.grading_type!r}')
    topic = get_object_or_404(Topic.objects.select_related('subject', 'subject_block'), id=payload.topic_id)
    services.ensure_is_tutor_for_subject(request, topic.subject_id)
    return lesson_services.create_lesson(
        topic,
        title=payload.title,
        lesson_type=payload.lesson_type,
        grading_type=payload.grading_type,
        content=payload.content,
        task_content=payload.task_content,
        synopsis=payload.synopsis,
    )


# Not "/lessons/needing-review": that would collide with "/lessons/{lesson_id}".
@router.get(
    '/lessons-needing-review',
    response=list[NeedReviewLessonOut],
    operation_id='list_tutor_lessons_needing_review',
)
def list_lessons_needing_review(request: HttpRequest, subject: int | None = None, class_id: int | None = None):
    """Lessons a student flagged with the preschool lesson screen's warning
    button (Lesson.need_review), in the tutor's own subjects — the "lessons
    that need review" section of the tutor dashboard. Filterable by subject
    and class like the dashboard's other feeds."""
    lessons = (
        Lesson.objects.filter(need_review=True, topic__subject_id__in=services.get_tutor_subject_ids(request.auth))
        .select_related('topic__subject__school_class')
        .order_by(
            'topic__subject__school_class__order_index',
            'topic__subject__name',
            'topic__order_index',
            'order_index',
        )
    )
    if subject is not None:
        lessons = lessons.filter(topic__subject_id=subject)
    if class_id is not None:
        lessons = lessons.filter(topic__subject__school_class_id=class_id)
    return [
        NeedReviewLessonOut(
            id=lesson.id,
            title=lesson.title,
            topic_title=lesson.topic.title,
            subject_id=lesson.topic.subject_id,
            subject_name=lesson.topic.subject.name,
            class_id=lesson.topic.subject.school_class_id,
            class_name=lesson.topic.subject.school_class.name,
        )
        for lesson in lessons
    ]


@router.patch('/lessons/{lesson_id}/need-review', response=LessonOut, operation_id='set_tutor_lesson_need_review')
def set_lesson_need_review(request: HttpRequest, lesson_id: int, payload: SetNeedReviewIn):
    """Clears (or sets) Lesson.need_review — the tutor dashboard's "problem
    fixed" button. Sets rather than toggles, so a double click can't flip it."""
    require_csrf(request)
    lesson = get_object_or_404(
        Lesson.objects.select_related('topic__subject__school_class', 'topic__subject_block'), id=lesson_id
    )
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    lesson.need_review = payload.need_review
    lesson.save(update_fields=['need_review'])
    return lesson


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
    task_content, synopsis, lesson_type, grading_type. Quiz questions/choices
    aren't editable here yet."""
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
    lesson.synopsis = payload.synopsis
    lesson.lesson_type = payload.lesson_type
    lesson.grading_type = payload.grading_type
    lesson.save(update_fields=['title', 'content', 'task_content', 'synopsis', 'lesson_type', 'grading_type'])
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


@router.post('/lessons/{lesson_id}/duplicate', response=LessonOut, operation_id='duplicate_tutor_lesson')
def duplicate_lesson(request: HttpRequest, lesson_id: int):
    """Copies a Lesson (content, quiz questions/choices, materials) into a
    new one appended at the end of the same topic — the tutor's
    "Дублювати" button on the Subject detail page. See
    lesson_services.duplicate_lesson for the title-numbering rule."""
    require_csrf(request)
    lesson = get_object_or_404(
        Lesson.objects.select_related('topic__subject', 'topic__subject_block'), id=lesson_id
    )
    services.ensure_is_tutor_for_subject(request, lesson.topic.subject_id)
    return lesson_services.duplicate_lesson(lesson)


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
    return [_tutor_student_out(s, request) for s in students]


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
    """Removes a StudentLesson assignment — while it's still Assigned, or
    In Progress with no submission yet, from a tutor's "View calendar" page
    for that student."""
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    if student_lesson.status == StudentLessonStatus.IN_PROGRESS:
        if student_lesson.submissions.exists():
            raise HttpError(409, 'Cannot remove a lesson that already has a submission')
    elif student_lesson.status != StudentLessonStatus.ASSIGNED:
        raise HttpError(409, 'Can only remove a lesson while it is Assigned or In Progress')
    student_lesson.delete()
    response.status_code = 204
    return response


@router.post('/student-lessons/{student_lesson_id}/mark-complete', operation_id='mark_tutor_student_lesson_complete')
def mark_student_lesson_complete(request: HttpRequest, student_lesson_id: int, response: HttpResponse):
    """Lets a tutor mark any of a student's lessons as done directly —
    e.g. one actually finished in person/off-platform — regardless of its
    current status, unlike grade() above (which only accepts a submission
    the student has already sent in, from PendingReview). Used by the
    student-overview page's "Сьогоднішні уроки" tab (frontend's
    tutor-student-overview-page.tsx)."""
    require_csrf(request)
    student_lesson = _get_scoped_student_lesson(request, student_lesson_id)
    if student_lesson.status == StudentLessonStatus.COMPLETED:
        raise HttpError(409, 'Lesson is already completed')
    lesson_services.mark_completed(student_lesson, request.auth)
    response.status_code = 204
    return response


@router.get('/students', response=list[TutorStudentOut])
def list_students(request: HttpRequest):
    students = services.get_tutor_students(request.auth)
    return [_tutor_student_out(s, request) for s in students]


@router.get('/students/{student_id}', response=TutorStudentOut, operation_id='get_tutor_student')
def get_student(request: HttpRequest, student_id: int):
    """Powers the "View calendar" page's breadcrumb/header and the student
    overview page (with_avatar=True — its avatar + today's-lessons summary)
    — this is for navigating there directly by student_id; the roster itself
    (get_tutor_class) doesn't need the avatar composite."""
    student = get_object_or_404(
        StudentProfile.objects.select_related('user', 'school_class', 'equipped_avatar'), id=student_id
    )
    services.ensure_is_tutor_for_class(request, student.school_class_id)
    return _tutor_student_out(student, request, with_avatar=True)


@router.patch(
    '/students/{student_id}/can-do-any-lesson',
    response=TutorStudentOut,
    operation_id='set_student_can_do_any_lesson',
)
def set_student_can_do_any_lesson(request: HttpRequest, student_id: int, payload: SetCanDoAnyLessonIn):
    """Tutor-toggled flag letting this student open/start any lesson in
    their class's subjects, not just ones assigned to them — see
    StudentProfile.can_do_any_lesson and lessons.api.preview_lesson/
    start_lesson_today."""
    require_csrf(request)
    student = get_object_or_404(
        StudentProfile.objects.select_related('user', 'school_class', 'equipped_avatar'), id=student_id
    )
    services.ensure_is_tutor_for_class(request, student.school_class_id)
    student.can_do_any_lesson = payload.can_do_any_lesson
    student.save(update_fields=['can_do_any_lesson'])
    return _tutor_student_out(student, request, with_avatar=True)


@router.get(
    '/students/{student_id}/achievements',
    response=list[SubjectAchievementOut],
    operation_id='list_tutor_student_achievements',
)
def list_student_achievements(request: HttpRequest, student_id: int):
    """Per-subject completion for the "Статистика" tab on the tutor's
    student-overview page — same computation as the student's own "Мої
    досягнення" page (achievements.services.list_subject_achievements)."""
    student = get_object_or_404(StudentProfile.objects.select_related('school_class'), id=student_id)
    services.ensure_is_tutor_for_class(request, student.school_class_id)
    return achievements_services.list_subject_achievements(student, request)


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
            _tutor_student_out(s, request, class_id=class_id, class_name=school_class.name) for s in students
        ],
        subjects=[_assignment_out(a, request) for a in assignments],
    )


@router.post('/classes/{class_id}/subjects', response=AssignmentOut, operation_id='create_tutor_class_subject')
def create_tutor_class_subject(request: HttpRequest, class_id: int, payload: CreateSubjectIn):
    """The "Додати урок" popup on the Class detail page — a bare Subject
    with just a name and a date range (defaults to the class's own academic
    year, September 1 .. May 31, on the frontend), for a tutor to fill in
    with topics/lessons afterward — same entry point as uploading a plan or
    a Markdown curriculum file (upload_class_plan/upload_subject_markdown
    below), just without either. Restricted to the class's homeroom
    teacher, same as those two, so a Subject always starts out with an
    owning tutor: creating it fires the on_subject_created signal
    (tutoring.signals.assign_class_teacher_to_subject), same as every other
    Subject-creation path."""
    require_csrf(request)
    services.ensure_is_class_teacher(request, class_id)
    school_class = get_object_or_404(Class, id=class_id)

    group = get_object_or_404(SubjectGroup, id=payload.group_id) if payload.group_id is not None else None
    subject = Subject.objects.create(
        school_class=school_class,
        name=payload.name,
        start_date=payload.start_date,
        due_date=payload.due_date,
        group=group,
    )
    subject.color = academics_services.assign_subject_color(subject)
    subject.order_index = academics_services.assign_subject_order_index(subject)
    subject.save(update_fields=['color', 'order_index'])
    academics_services.ensure_subject_blocks(subject)
    academics_services.assign_topics_to_blocks(subject)

    assignment = _tutor_assignments_with_counts(request, subject_id=subject.id).get()
    return _assignment_out(assignment, request)


@router.patch('/classes/{class_id}/subjects/reorder', operation_id='reorder_tutor_class_subjects')
def reorder_class_subjects(request: HttpRequest, class_id: int, payload: SubjectsReorderIn):
    """Bulk-updates Subject.order_index (and, for a dragged-across-group
    move, Subject.group) for the subjects *this* tutor teaches in the
    class — powers drag-and-drop subject reordering/grouping on the tutor's
    Class detail page. Scoped to the tutor's own assignments in this class,
    same as every other subject the page shows or lets them drag."""
    require_csrf(request)
    services.ensure_is_tutor_for_class(request, class_id)
    subjects_by_id = {
        s.id: s
        for s in Subject.objects.filter(
            school_class_id=class_id, id__in=services.get_tutor_subject_ids(request.auth)
        )
    }

    updated = []
    for item in payload.items:
        subject = subjects_by_id.get(item.id)
        if subject is None:
            raise HttpError(404, f'Subject {item.id} not found among your subjects in this class')
        subject.order_index = item.order_index
        if item.group_id is not None:
            subject.group_id = item.group_id
        updated.append(subject)

    Subject.objects.bulk_update(updated, ['order_index', 'group'])
    return {'updated': len(updated)}


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


@router.post(
    '/classes/{class_id}/subject-markdown',
    response=ImportSubjectMarkdownOut,
    operation_id='upload_tutor_subject_markdown',
)
def upload_subject_markdown(request: HttpRequest, class_id: int, file: UploadedFile = File(...)):
    """The "Завантажити предмет з Markdown" wizard on the Class detail page —
    uploads one subject's full curriculum (metadata, description,
    SubjectBlocks, topics and lessons) as a single markdown file and
    imports it immediately (see academics.services.parse_subject_markdown
    and lesson_services.import_subject_markdown). Restricted to the class's
    homeroom teacher, same as upload_class_plan."""
    require_csrf(request)
    services.ensure_is_class_teacher(request, class_id)
    school_class = get_object_or_404(Class, id=class_id)

    try:
        text = file.read().decode('utf-8')
    except UnicodeDecodeError as exc:
        raise HttpError(400, f'File must be UTF-8 text: {exc}') from exc

    plan = academics_services.parse_subject_markdown(text)
    if not plan.subject_name:
        raise HttpError(400, 'No "Subject: …" header found in the file')
    if not plan.topics:
        raise HttpError(400, 'No "## Topic" sections found in the file')

    summary = lesson_services.import_subject_markdown(school_class, plan)
    return ImportSubjectMarkdownOut(
        subject_id=summary.subject_id,
        subject_name=summary.subject_name,
        subject_created=summary.subject_created,
        blocks_count=summary.blocks_count,
        topics_created=summary.topics_created,
        topics_reused=summary.topics_reused,
        topics=[SubjectMarkdownTopicOut(id=topic.id, title=topic.title) for topic in summary.topics],
        lessons_created=summary.lessons_created,
        lessons_skipped=summary.lessons_skipped,
        lessons=[
            SubjectMarkdownLessonOut(id=lesson.id, title=lesson.title, is_new=is_new)
            for lesson, is_new in summary.lessons
        ],
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


@router.patch('/avatar-items/{item_id}/artwork', response=AvatarItemOut, operation_id='update_tutor_avatar_item_artwork')
def update_tutor_avatar_item_artwork(request: HttpRequest, item_id: int, payload: UpdateAvatarItemArtworkIn):
    """Overwrites a wardrobe item's SVG artwork file outright — the tutor's
    graphical SVG-Edit-based touch-up editor, not the scale/offset/rotation
    fine-tuning update_tutor_avatar_item_transform does. AvatarItem.image has
    no format validators of its own (see the model), so this is the only
    guard against saving something that isn't actually SVG."""
    require_csrf(request)
    ensure_is_tutor(request)
    item = get_object_or_404(AvatarItem, id=item_id)
    if not payload.svg.lstrip().startswith(('<svg', '<?xml')):
        raise HttpError(400, 'Not an SVG document')
    item.image.save(f'{item.key}.svg', ContentFile(payload.svg.encode('utf-8')), save=True)
    return _tutor_avatar_item_out(item, request)


def _tutor_furniture_item_out(item: FurnitureItem, request: HttpRequest) -> TutorFurnitureItemOut:
    return TutorFurnitureItemOut(
        id=item.id,
        key=item.key,
        name=item.name,
        model_file=_absolute_file_url(item.model_file, request),
        model_format=house_services.model_format(item),
        material_file=_absolute_file_url(item.material_file, request),
        textures=[
            FurnitureTextureOut(id=t.id, url=_absolute_file_url(t.file, request), filename=t.original_filename)
            for t in item.textures.all()
        ],
        thumbnail_image=_absolute_file_url(item.thumbnail_image, request),
        price=item.price,
        surface=item.surface,
        default_scale=item.default_scale,
        default_rotation=[item.default_rotation_x, item.default_rotation_y, item.default_rotation_z],
        default_position=[item.default_position_x, item.default_position_y, item.default_position_z],
        is_active=item.is_active,
    )


@router.get('/furniture', response=list[TutorFurnitureItemOut], operation_id='list_tutor_furniture')
def list_tutor_furniture(request: HttpRequest):
    """The full house furniture catalog (active and inactive) — powers the
    furniture editor page (Редактор фурнітури). See docs/core/gamification.md
    and house.schemas.FurnitureItemOut for the student-facing counterpart."""
    ensure_is_tutor(request)
    items = FurnitureItem.objects.all().prefetch_related('textures')
    return [_tutor_furniture_item_out(item, request) for item in items]


@router.post('/furniture', response=TutorFurnitureItemOut, operation_id='create_tutor_furniture_item')
def create_tutor_furniture_item(
    request: HttpRequest,
    key: str = Form(...),
    name: str = Form(...),
    price: int = Form(0),
    surface: str = Form(FurnitureSurface.FLOOR),
    model_file: UploadedFile = File(...),
    thumbnail_image: UploadedFile = File(...),
    texture_files: list[UploadedFile] = File([]),
    material_file: UploadedFile | None = File(None),
):
    """Uploads a new furniture item to the shop catalog — the "Upload"
    action on the furniture editor. model_file must be .obj/.stl and
    material_file (if given) .mtl, matching FurnitureItem's own field
    validators (bypassed here since we build the row with .objects.create()
    rather than a ModelForm, so it's re-checked by hand). Any number of
    texture_files may be attached — see models.FurnitureTexture; more can
    be added later via add_tutor_furniture_textures. Starts at the default
    transform (position 0, rotation 0, scale 1) — see
    update_tutor_furniture_item for adjusting it afterwards."""
    require_csrf(request)
    ensure_is_tutor(request)

    if not model_file.name.lower().endswith(('.obj', '.stl')):
        raise HttpError(400, 'model_file must be .obj or .stl')
    if material_file is not None and not material_file.name.lower().endswith('.mtl'):
        raise HttpError(400, 'material_file must be .mtl')
    if surface not in FurnitureSurface.values:
        raise HttpError(400, f'surface must be one of {FurnitureSurface.values}')
    if FurnitureItem.objects.filter(key=key).exists():
        raise HttpError(409, f'A furniture item with key "{key}" already exists')

    item = FurnitureItem(key=key, name=name, price=price, surface=surface)
    item.model_file.save(model_file.name, model_file, save=False)
    item.thumbnail_image.save(thumbnail_image.name, thumbnail_image, save=False)
    if material_file is not None:
        item.material_file.save(material_file.name, material_file, save=False)
    item.save()
    for texture_file in texture_files:
        texture = FurnitureTexture(item=item, original_filename=texture_file.name)
        texture.file.save(texture_file.name, texture_file, save=False)
        texture.save()
    return _tutor_furniture_item_out(item, request)


@router.post(
    '/furniture/{item_id}/textures', response=TutorFurnitureItemOut, operation_id='add_tutor_furniture_textures',
)
def add_tutor_furniture_textures(request: HttpRequest, item_id: int, texture_files: list[UploadedFile] = File(...)):
    """Adds one or more texture images to an existing item — see
    models.FurnitureTexture. Lets a tutor attach the rest of a .mtl's
    referenced textures after the initial upload, without re-uploading the
    model/material file."""
    require_csrf(request)
    ensure_is_tutor(request)
    item = get_object_or_404(FurnitureItem, id=item_id)
    for texture_file in texture_files:
        texture = FurnitureTexture(item=item, original_filename=texture_file.name)
        texture.file.save(texture_file.name, texture_file, save=False)
        texture.save()
    return _tutor_furniture_item_out(item, request)


@router.delete(
    '/furniture/{item_id}/textures/{texture_id}',
    response=TutorFurnitureItemOut,
    operation_id='delete_tutor_furniture_texture',
)
def delete_tutor_furniture_texture(request: HttpRequest, item_id: int, texture_id: int):
    """Removes one texture from an item's catalog entry — see
    models.FurnitureTexture. Returns the still-existing parent item (not
    204) since deleting a texture doesn't delete the item itself."""
    require_csrf(request)
    ensure_is_tutor(request)
    item = get_object_or_404(FurnitureItem, id=item_id)
    texture = get_object_or_404(FurnitureTexture, id=texture_id, item=item)
    texture.delete()
    return _tutor_furniture_item_out(item, request)


@router.patch('/furniture/{item_id}', response=TutorFurnitureItemOut, operation_id='update_tutor_furniture_item')
def update_tutor_furniture_item(request: HttpRequest, item_id: int, payload: UpdateTutorFurnitureItemIn):
    """Sets a furniture item's Diamond price, which surface it sticks to,
    and its catalog default scale/rotation/position — the transform every
    purchase/Add starts from (see house.services.purchase_item/place_item)
    — from the furniture editor's controls. default_position is a small
    nudge off the surface (see house-3d's lib/surface.ts, which clamps it
    to a modest range), for a model whose own pivot isn't at its base and
    so looks sunk into the floor (or floating off a wall/ceiling) at the
    catalog default."""
    require_csrf(request)
    ensure_is_tutor(request)
    if payload.surface not in FurnitureSurface.values:
        raise HttpError(400, f'surface must be one of {FurnitureSurface.values}')
    item = get_object_or_404(FurnitureItem, id=item_id)
    item.price = payload.price
    item.surface = payload.surface
    item.default_scale = payload.default_scale
    item.default_rotation_x, item.default_rotation_y, item.default_rotation_z = payload.default_rotation
    item.default_position_x, item.default_position_y, item.default_position_z = payload.default_position
    item.save(
        update_fields=[
            'price', 'surface', 'default_scale',
            'default_rotation_x', 'default_rotation_y', 'default_rotation_z',
            'default_position_x', 'default_position_y', 'default_position_z',
        ]
    )
    return _tutor_furniture_item_out(item, request)


@router.delete('/furniture/{item_id}', operation_id='delete_tutor_furniture_item')
def delete_tutor_furniture_item(request: HttpRequest, item_id: int, response: HttpResponse):
    """Removes a furniture item from the catalog entirely — cascades to
    every student's FurniturePurchase/PlacedFurnitureItem for it (see
    house.models), same as deleting it from the Django admin."""
    require_csrf(request)
    ensure_is_tutor(request)
    item = get_object_or_404(FurnitureItem, id=item_id)
    item.delete()
    response.status_code = 204
    return response
