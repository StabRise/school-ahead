import json
from dataclasses import dataclass, field
from decimal import Decimal

from academics import services as academics_services
from academics.models import Subject, SubjectBlock, Topic
from accounts.models import StudentProfile, User
from django.db import transaction
from django.db.models import Count, F, QuerySet
from django.utils import timezone

from .models import (
    GradeResult,
    GradingType,
    Lesson,
    LessonComment,
    LessonCommentKind,
    LessonsJson,
    LessonsJsonStatus,
    LessonSubmission,
    LessonType,
    QuizChoice,
    QuizLanguage,
    QuizQuestion,
    StudentLesson,
    StudentLessonStatus,
    StudentLessonStatusEvent,
)

QUIZ_PASS_THRESHOLD_PERCENT = 60

# Diamond reward for completing a lesson — see docs/core/progress.md
# section 2. This is intentionally the simple StudentProfile.diamond_
# balance_cache counter, not the append-only ledger docs/architecture/
# 02-data-model.md decision 3 describes; see that doc's note for the gap.
LESSON_COMPLETION_DIAMONDS = 1
LESSON_COMPLETION_AHEAD_DIAMONDS = 2


class InvalidTransition(Exception):
    pass


def _transition(student_lesson: StudentLesson, actor: User, to_status: str, note: str = '') -> None:
    """Records the status change and applies it. Callers still need to
    save() the student_lesson (this only mutates the in-memory instance and
    writes the audit-log row) — see docs/architecture/03-lesson-lifecycle.md."""
    StudentLessonStatusEvent.objects.create(
        student_lesson=student_lesson,
        from_status=student_lesson.status,
        to_status=to_status,
        actor=actor,
        note=note,
    )
    student_lesson.status = to_status


def _guard_status(student_lesson: StudentLesson, *expected: str) -> None:
    if student_lesson.status not in expected:
        raise InvalidTransition(
            f'Cannot perform this action from status {student_lesson.status!r}'
        )


def _score_to_grade_points(score_percent: Decimal) -> int:
    """No exact formula is specified in the docs (flagged as an open
    question, similar to the undocumented diamond formula) — a simple linear
    mapping onto the 1-12 scale, clamped, is used as a reasonable default."""
    points = round(float(score_percent) / 100 * 12)
    return max(1, min(12, points))


def _award_completion_diamonds(student_lesson: StudentLesson) -> None:
    """+1 diamond for completing on/after the scheduled date, +2 if
    completed strictly before it — the same "ahead" condition
    scheduling.api's CalendarItemOut.is_completed_ahead already uses. An
    atomic F() update, since this can run concurrently with other requests
    touching the same StudentProfile."""
    is_ahead = student_lesson.completed_at.date() < student_lesson.scheduled_date
    amount = LESSON_COMPLETION_AHEAD_DIAMONDS if is_ahead else LESSON_COMPLETION_DIAMONDS
    StudentProfile.objects.filter(pk=student_lesson.student_id).update(
        diamond_balance_cache=F('diamond_balance_cache') + amount
    )


def mark_completed(
    student_lesson: StudentLesson,
    actor: User,
    *,
    grade_points: int | None = None,
    grade_result: str | None = None,
) -> None:
    _transition(student_lesson, actor, StudentLessonStatus.COMPLETED)
    student_lesson.completed_at = timezone.now()
    student_lesson.grade_points = grade_points
    student_lesson.grade_result = grade_result
    student_lesson.save()
    _award_completion_diamonds(student_lesson)


def start(student_lesson: StudentLesson, actor: User) -> None:
    _guard_status(student_lesson, StudentLessonStatus.ASSIGNED)
    _transition(student_lesson, actor, StudentLessonStatus.IN_PROGRESS)
    student_lesson.started_at = timezone.now()
    student_lesson.save()


def ensure_started(student_lesson: StudentLesson, actor: User) -> None:
    """Auto-transition Assigned -> InProgress on lesson access. No-op once
    the lesson has already progressed. Called from GET /{id} so the
    frontend no longer needs an explicit "Start Lesson" action — see the
    lesson wizard's "State Transition & UI Rules" spec, section 2.1."""
    if student_lesson.status == StudentLessonStatus.ASSIGNED:
        start(student_lesson, actor)


def submit_quiz(student_lesson: StudentLesson, actor: User, answers: dict[int, int]) -> Decimal:
    """answers: {question_id: choice_id}. Returns the score percentage.
    Score > 60% -> Completed (Path A). Otherwise the lesson stays
    InProgress — the caller decides between retrying (attempt_count already
    incremented here) or calling request_help, per
    docs/architecture/03-lesson-lifecycle.md."""
    _guard_status(student_lesson, StudentLessonStatus.IN_PROGRESS)

    questions = list(student_lesson.lesson.quiz_questions.all())
    correct_choice_ids = set(
        QuizChoice.objects.filter(question__lesson=student_lesson.lesson, is_correct=True)
        .values_list('question_id', 'id')
    )
    correct_count = sum(
        1 for q in questions if (q.id, answers.get(q.id)) in correct_choice_ids
    )
    score = Decimal(correct_count) / Decimal(len(questions) or 1) * 100
    student_lesson.quiz_score_percent = score
    student_lesson.attempt_count += 1

    if score > QUIZ_PASS_THRESHOLD_PERCENT:
        mark_completed(student_lesson, actor, grade_points=_score_to_grade_points(score))
    else:
        student_lesson.save()

    return score


def confirm_understanding(student_lesson: StudentLesson, actor: User, understood: bool) -> None:
    _guard_status(student_lesson, StudentLessonStatus.IN_PROGRESS)
    if understood:
        mark_completed(student_lesson, actor, grade_result=GradeResult.PASS)
    else:
        _transition(student_lesson, actor, StudentLessonStatus.NEED_HELP)
        student_lesson.save()


def submit_task(student_lesson: StudentLesson, actor: User, *, file=None, comment: str = '') -> LessonSubmission:
    _guard_status(student_lesson, StudentLessonStatus.IN_PROGRESS)
    submission = LessonSubmission.objects.create(
        student_lesson=student_lesson, file=file, comment=comment
    )
    _transition(student_lesson, actor, StudentLessonStatus.PENDING_REVIEW)
    student_lesson.save()
    return submission


def request_help(student_lesson: StudentLesson, actor: User, note: str = '') -> None:
    _guard_status(student_lesson, StudentLessonStatus.IN_PROGRESS)
    student_lesson.help_note = note
    _transition(student_lesson, actor, StudentLessonStatus.NEED_HELP)
    student_lesson.save()
    LessonComment.objects.create(
        student_lesson=student_lesson, author=actor, body=note, kind=LessonCommentKind.HELP_REQUEST
    )


def resolve_own_help_request(student_lesson: StudentLesson, actor: User) -> None:
    """Student-initiated self-resolution: "I no longer need help" — NeedHelp
    -> InProgress, and the originating help_request comment is marked
    resolved. Distinct from tutoring's tutor-driven resolve_need_help. See
    section 2.3 ("Resolution Workflow")."""
    _guard_status(student_lesson, StudentLessonStatus.NEED_HELP)
    _transition(student_lesson, actor, StudentLessonStatus.IN_PROGRESS)
    student_lesson.save()
    latest_help_request = (
        student_lesson.comments.filter(kind=LessonCommentKind.HELP_REQUEST, is_resolved=False)
        .order_by('-created_at')
        .first()
    )
    if latest_help_request is not None:
        latest_help_request.is_resolved = True
        latest_help_request.resolved_at = timezone.now()
        latest_help_request.save(update_fields=['is_resolved', 'resolved_at'])


def add_comment(
    student_lesson: StudentLesson, actor: User, body: str, *, kind: str = LessonCommentKind.GENERAL
) -> LessonComment:
    """Posts a general comment, available to both the owning student and any
    tutor scoped to the lesson's subject, at any StudentLesson status —
    never mutates `status`. See section 2.2."""
    return LessonComment.objects.create(student_lesson=student_lesson, author=actor, body=body, kind=kind)


def resolve_need_help(
    student_lesson: StudentLesson,
    actor: User,
    *,
    to_status: str,
    grade_points: int | None = None,
    grade_result: str | None = None,
    feedback: str = '',
) -> None:
    _guard_status(student_lesson, StudentLessonStatus.NEED_HELP)

    if to_status == StudentLessonStatus.IN_PROGRESS:
        # The tutor's reply threads under the question it answers, rather
        # than landing on StudentLesson.tutor_feedback (that field is for
        # lesson-completion feedback — see the `completed` branch below).
        question = (
            student_lesson.comments.filter(kind=LessonCommentKind.HELP_REQUEST, is_resolved=False)
            .order_by('-created_at')
            .first()
        )
        if question is not None:
            question.is_resolved = True
            question.resolved_at = timezone.now()
            question.save(update_fields=['is_resolved', 'resolved_at'])
        if feedback:
            LessonComment.objects.create(
                student_lesson=student_lesson,
                author=actor,
                body=feedback,
                kind=LessonCommentKind.GENERAL,
                reply_to=question,
            )
        _transition(student_lesson, actor, StudentLessonStatus.IN_PROGRESS)
        student_lesson.save()
    elif to_status == StudentLessonStatus.COMPLETED:
        if feedback:
            student_lesson.tutor_feedback = feedback
        mark_completed(student_lesson, actor, grade_points=grade_points, grade_result=grade_result)
    else:
        raise InvalidTransition(f'NeedHelp cannot resolve to {to_status!r}')


def _attach_feedback_to_latest_submission(student_lesson: StudentLesson, feedback: str) -> None:
    """Threads the tutor's reply under the specific submission it responds
    to, rather than only on the StudentLesson as a whole — see
    LessonSubmission.tutor_feedback."""
    submission = student_lesson.submissions.filter(is_latest=True).order_by('-submitted_at').first()
    if submission is not None:
        submission.tutor_feedback = feedback
        submission.feedback_at = timezone.now()
        submission.save(update_fields=['tutor_feedback', 'feedback_at'])


def grade_submission(
    student_lesson: StudentLesson,
    actor: User,
    *,
    grade_points: int | None = None,
    grade_result: str | None = None,
    feedback: str = '',
) -> None:
    _guard_status(student_lesson, StudentLessonStatus.PENDING_REVIEW)
    if feedback:
        student_lesson.tutor_feedback = feedback
        _attach_feedback_to_latest_submission(student_lesson, feedback)
    mark_completed(student_lesson, actor, grade_points=grade_points, grade_result=grade_result)


def request_revision(student_lesson: StudentLesson, actor: User, feedback: str) -> None:
    _guard_status(student_lesson, StudentLessonStatus.PENDING_REVIEW)
    student_lesson.tutor_feedback = feedback
    _attach_feedback_to_latest_submission(student_lesson, feedback)
    _transition(student_lesson, actor, StudentLessonStatus.REVISION_REQUIRED)
    student_lesson.save()


def resubmit(student_lesson: StudentLesson, actor: User, *, file=None, comment: str = '') -> LessonSubmission:
    _guard_status(student_lesson, StudentLessonStatus.REVISION_REQUIRED)
    student_lesson.submissions.update(is_latest=False)
    submission = LessonSubmission.objects.create(
        student_lesson=student_lesson, file=file, comment=comment
    )
    _transition(student_lesson, actor, StudentLessonStatus.PENDING_REVIEW)
    student_lesson.save()
    return submission


def compute_completion(total_lessons: int, student_lessons: QuerySet) -> tuple[int, int, float]:
    """(completed_count, total_count, completed_percent) — total_lessons is
    every Lesson in scope (assigned to this student or not, e.g. every
    Lesson in a subject/topic), completed_count is this student's completed
    StudentLesson rows among them. Shared by the Subject/Topic detail pages'
    progress bars and the achievements overview (docs/interfaces/student/subjects.md)."""
    completed = student_lessons.filter(status=StudentLessonStatus.COMPLETED).count()
    percent = round(completed / total_lessons * 100, 1) if total_lessons else 0.0
    return completed, total_lessons, percent


@dataclass
class BlockProgress:
    id: int
    index: int
    label: str
    completed_count: int
    total_count: int
    completed_percent: float


def compute_block_progress(subject_id: int, student: StudentProfile) -> list[BlockProgress]:
    """Per-SubjectBlock completion within a subject, same total-vs-assigned
    semantics as compute_completion — powers the Subject detail page's
    per-semester bars and the achievements overview's per-subject
    breakdown. Two aggregate queries regardless of lesson count, rather than
    one per block."""
    blocks = list(SubjectBlock.objects.filter(subject_id=subject_id).order_by('index'))
    if not blocks:
        return []

    total_by_block = dict(
        Lesson.objects.filter(topic__subject_id=subject_id, topic__subject_block_id__isnull=False)
        .values('topic__subject_block_id')
        .annotate(count=Count('id'))
        .values_list('topic__subject_block_id', 'count')
    )
    completed_by_block = dict(
        StudentLesson.objects.filter(
            student=student,
            lesson__topic__subject_id=subject_id,
            lesson__topic__subject_block_id__isnull=False,
            status=StudentLessonStatus.COMPLETED,
        )
        .values('lesson__topic__subject_block_id')
        .annotate(count=Count('id'))
        .values_list('lesson__topic__subject_block_id', 'count')
    )

    result = []
    for block in blocks:
        total = total_by_block.get(block.id, 0)
        completed = completed_by_block.get(block.id, 0)
        percent = round(completed / total * 100, 1) if total else 0.0
        result.append(
            BlockProgress(
                id=block.id, index=block.index, label=block.label,
                completed_count=completed, total_count=total, completed_percent=percent,
            )
        )
    return result


def reschedule(student_lesson: StudentLesson, new_date) -> None:
    """Manual single-lesson reschedule, called from scheduling's
    POST /student-lessons/{id}/reschedule. Not allowed once completed — see
    docs/architecture/02-data-model.md decision 5."""
    if student_lesson.status == StudentLessonStatus.COMPLETED:
        raise InvalidTransition('Cannot reschedule a completed lesson')
    student_lesson.scheduled_date = new_date
    student_lesson.is_manually_scheduled = True
    student_lesson.save(update_fields=['scheduled_date', 'is_manually_scheduled'])


def sync_scheduled_lesson(student: StudentProfile, lesson: Lesson, scheduled_date) -> StudentLesson:
    """Create-or-update a StudentLesson's scheduled_date for calendar
    generation/recalculation (scheduling.services). Skips existing rows that
    are completed or manually scheduled. See
    docs/architecture/08-calendar-generation.md. (Block membership is not
    this function's concern — it's derived from lesson.topic.subject_block,
    assigned by academics.services.assign_topics_to_blocks.)"""
    student_lesson, created = StudentLesson.objects.get_or_create(
        student=student,
        lesson=lesson,
        defaults={'scheduled_date': scheduled_date},
    )
    if created:
        return student_lesson

    if student_lesson.status == StudentLessonStatus.COMPLETED or student_lesson.is_manually_scheduled:
        return student_lesson

    student_lesson.scheduled_date = scheduled_date
    student_lesson.save(update_fields=['scheduled_date'])
    return student_lesson


def assign_student(lesson: Lesson, student: StudentProfile, scheduled_date) -> StudentLesson:
    """A tutor manually assigning a lesson to a student who doesn't already
    have it (tutoring.api.assign_lesson_to_student) — unlike
    sync_scheduled_lesson this is create-only (never touches an existing
    row) and always marks the result manually scheduled, same as
    reschedule(), so later calendar recalculation never silently moves it."""
    if StudentLesson.objects.filter(student=student, lesson=lesson).exists():
        raise InvalidTransition('Student already has this lesson assigned')
    return StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=scheduled_date, is_manually_scheduled=True
    )


# Title of the catch-all Topic a tutor's one-off lessons land under — see
# get_or_create_extra_topic.
EXTRA_TOPIC_TITLE = 'Extra'


def get_or_create_extra_topic(subject: Subject) -> Topic:
    """Gets-or-creates the tutor's freeform "Extra" topic in a subject's most
    recent semester block — used when a tutor assigns a one-off lesson that
    isn't part of the generated curriculum (tutoring.api.assign_day_lesson,
    is_new=true branch). Pinned to that block
    (Topic.subject_block_manually_set) so a later reorder/recompute
    (academics.services.assign_topics_to_blocks) can't drift it into an
    earlier semester."""
    academics_services.ensure_subject_blocks(subject)
    last_block = subject.blocks.order_by('-index').first()
    topic = Topic.objects.filter(subject=subject, title=EXTRA_TOPIC_TITLE, subject_block=last_block).first()
    if topic is not None:
        return topic
    return Topic.objects.create(
        subject=subject,
        title=EXTRA_TOPIC_TITLE,
        order_index=_next_order_index(Topic.objects.filter(subject=subject)),
        subject_block=last_block,
        subject_block_manually_set=True,
    )


def create_extra_lesson(subject: Subject, *, title: str, content: str, task_content: str = '') -> Lesson:
    """Creates a one-off Lesson under get_or_create_extra_topic, for the
    tutor's "assign a lesson to this day" popup's is_new=true branch
    (tutoring.api.assign_day_lesson). Type is with_task when task_content is
    given, otherwise theory; grading is binary (pass/fail), matching every
    other non-quiz lesson (see import_topics_and_lessons)."""
    topic = get_or_create_extra_topic(subject)
    lesson_type = LessonType.WITH_TASK if task_content else LessonType.THEORY
    return Lesson.objects.create(
        topic=topic,
        order_index=_next_order_index(Lesson.objects.filter(topic=topic)),
        title=title,
        lesson_type=lesson_type,
        grading_type=GradingType.BINARY,
        content=content,
        task_content=task_content,
    )


# --- scrape_lessons JSON import -------------------------------------------
# Shared by manage.py's import_lessons command and the tutor "Load lessons
# from JSON" dialog (tutoring.api.process_lessons_json). See
# lessons.management.commands.scrape_lessons for the JSON shape.

def _next_order_index(queryset: QuerySet) -> int:
    max_index = queryset.order_by('-order_index').values_list('order_index', flat=True).first()
    return (max_index or 0) + 1


def _render_extra_content_item(item: dict | str, lesson_title: str) -> str:
    """One entry of a scraped lesson's optional `extra_content` list. Either
    a plain string — already-formatted markdown, used as-is — or a dict:
    {"content": <url-or-text>, "type": "pdf"|"video"|"text", "name": <optional
    heading>}. `pdf` renders as a <pdfiframe> tag, same as the Конспект
    section scrape_lessons builds; `video` and free-form `text` both just
    render as plain text — a bare YouTube URL still auto-embeds via the
    frontend's YoutubeAwareLink (see frontend/components/markdown.tsx)."""
    if isinstance(item, str):
        return item

    value = item.get('content', '')
    item_type = (item.get('type') or '').strip().lower()
    name = item.get('name')

    if item_type == 'pdf':
        title_attr = str(name or lesson_title).replace('"', '&quot;')
        body = f'<pdfiframe file="{value}" title="{title_attr}"/>'
    else:
        body = value

    return f'## {name}\n\n{body}' if name else body


def build_lesson_content(lesson_data: dict) -> tuple[str, str]:
    """(content, task_content) for one scraped lesson dict — content starts
    with any `youtubes` URLs not already embedded in `content` itself (a
    bare YouTube link auto-embeds inline, see
    frontend/components/markdown.tsx) — scrape_lessons already folds them
    into `content` directly, while the hand-authored quiz JSON format lists
    them separately, sometimes alongside its own `content` — then the base
    markdown, then extra_content (either one markdown blob or a list of
    items — see _render_extra_content_item), then task_content appended last
    (also returned as-is, for Lesson.task_content itself)."""
    parts = []

    content = lesson_data.get('content', '')
    youtubes = lesson_data.get('youtubes')
    if youtubes and not any(url in content for url in youtubes):
        parts.append('\n\n'.join(youtubes))

    parts.append(content)

    extra_content = lesson_data.get('extra_content')
    if isinstance(extra_content, str):
        # A single already-formatted markdown blob, rather than a list of
        # items — iterating a bare string below would walk it character by
        # character.
        parts.append(extra_content.strip())
    elif extra_content:
        lesson_title = lesson_data['title']
        parts.append(
            '\n\n'.join(_render_extra_content_item(item, lesson_title) for item in extra_content if item)
        )

    task_content = lesson_data.get('task_content', '')
    if task_content:
        parts.append(task_content)

    return '\n\n'.join(part for part in parts if part), task_content


# Maps a JSON import's shorthand lesson_type values onto the model's
# LessonType choices — "quiz" is what the hand-authored quiz JSON format
# uses (see backend/scraped.tmp/*.json); scrape_lessons already writes the
# model's own values ('theory', 'with_task') directly.
_LESSON_TYPE_ALIASES = {'quiz': LessonType.WITH_QUIZ}


def _normalize_lesson_type(raw_lesson_type: str) -> str:
    return _LESSON_TYPE_ALIASES.get(raw_lesson_type, raw_lesson_type)


def _create_quiz_questions(lesson: Lesson, quiz_data: list[dict]) -> None:
    """Creates QuizQuestion/QuizChoice rows from a lesson dict's `quiz` list
    (see backend/scraped.tmp/*.json for the shape). Choices in that
    hand-authored format don't carry an explicit `is_correct` flag — the
    first choice listed for each question is the correct one by convention —
    but an explicit `is_correct` on any choice, when present, is honored
    instead."""
    for question_data in quiz_data:
        question = QuizQuestion.objects.create(
            lesson=lesson,
            prompt=question_data['prompt'],
            order_index=question_data.get('order_index', 0),
            language=question_data.get('language', QuizLanguage.UK),
        )
        choices = question_data.get('choices', [])
        has_explicit_correct = any('is_correct' in choice for choice in choices)
        for index, choice_data in enumerate(choices):
            is_correct = choice_data.get('is_correct', False) if has_explicit_correct else index == 0
            QuizChoice.objects.create(
                question=question,
                text=choice_data.get('text', ''),
                is_correct=is_correct,
            )


@dataclass
class LessonImportSummary:
    topics_created: int = 0
    topics_reused: int = 0
    lessons_created: list[Lesson] = field(default_factory=list)
    lessons_skipped: int = 0


def import_topics_and_lessons(subject: Subject, topics_data: list[dict]) -> LessonImportSummary:
    """Reuses an existing Topic by title where one already exists under
    `subject`, otherwise creates it; same for Lesson by (topic, title). Safe
    to call repeatedly with the same data — only genuinely new topics/
    lessons get created. Callers are responsible for wrapping this in
    transaction.atomic() if they need it (process_lessons_json and
    manage.py's import_lessons both do)."""
    summary = LessonImportSummary()
    next_topic_order = _next_order_index(Topic.objects.filter(subject=subject))

    for topic_data in topics_data:
        topic = Topic.objects.filter(subject=subject, title=topic_data['title']).first()
        if topic is None:
            topic = Topic.objects.create(
                subject=subject,
                title=topic_data['title'],
                description=topic_data.get('description', ''),
                order_index=next_topic_order,
            )
            next_topic_order += 1
            summary.topics_created += 1
        else:
            summary.topics_reused += 1

        next_lesson_order = _next_order_index(Lesson.objects.filter(topic=topic))

        for lesson_data in topic_data.get('lessons', []):
            if Lesson.objects.filter(topic=topic, title=lesson_data['title']).exists():
                summary.lessons_skipped += 1
                continue

            content, task_content = build_lesson_content(lesson_data)
            lesson_type = _normalize_lesson_type(lesson_data['lesson_type'])
            lesson = Lesson.objects.create(
                topic=topic,
                order_index=next_lesson_order,
                title=lesson_data['title'],
                lesson_type=lesson_type,
                # with_quiz is auto-graded on a 1-12 scale (see
                # _score_to_grade_points); the other lesson types ('theory',
                # 'with_task') both resolve to a Pass/Fail outcome
                # (docs/core/lessons.md Path B/C).
                grading_type=GradingType.POINTS if lesson_type == LessonType.WITH_QUIZ else GradingType.BINARY,
                content=content,
                task_content=task_content,
            )
            next_lesson_order += 1
            summary.lessons_created.append(lesson)

            quiz_data = lesson_data.get('quiz')
            if quiz_data:
                _create_quiz_questions(lesson, quiz_data)

    academics_services.assign_topics_to_blocks(subject)
    return summary


def process_lessons_json(lessons_json: LessonsJson) -> LessonImportSummary:
    """Reads lessons_json.json_file, imports its topics/lessons into
    lessons_json.subject, links every newly-created Lesson onto
    lessons_json.lessons, and marks it processed. Safe to call again later —
    a re-run only adds whatever's genuinely new."""
    with lessons_json.json_file.open('rb') as f:
        topics_data = json.load(f)

    with transaction.atomic():
        summary = import_topics_and_lessons(lessons_json.subject, topics_data)
        if summary.lessons_created:
            lessons_json.lessons.add(*summary.lessons_created)
        lessons_json.status = LessonsJsonStatus.PROCESSED
        lessons_json.save(update_fields=['status'])

    return summary
