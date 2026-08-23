from decimal import Decimal

from django.db.models import QuerySet
from django.utils import timezone

from accounts.models import StudentProfile, User

from .models import (
    GradeResult,
    Lesson,
    LessonComment,
    LessonCommentKind,
    LessonSubmission,
    QuizChoice,
    StudentLesson,
    StudentLessonStatus,
    StudentLessonStatusEvent,
)

QUIZ_PASS_THRESHOLD_PERCENT = 60


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
    # No diamond-ledger side effect this pass — gamification (`progress` app)
    # is explicitly deferred.
    student_lesson.save()


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


def compute_completion(student_lessons: QuerySet) -> tuple[int, int, float]:
    """(completed_count, total_count, completed_percent) over the given
    StudentLesson queryset — shared by the Subject/Topic detail pages'
    progress bars (docs/interfaces/student/subjects.md)."""
    total = student_lessons.count()
    completed = student_lessons.filter(status=StudentLessonStatus.COMPLETED).count()
    percent = round(completed / total * 100, 1) if total else 0.0
    return completed, total, percent


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
