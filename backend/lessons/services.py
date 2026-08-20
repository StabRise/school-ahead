from decimal import Decimal

from django.utils import timezone

from accounts.models import StudentProfile, User

from .models import (
    GradeResult,
    Lesson,
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
    if feedback:
        student_lesson.tutor_feedback = feedback

    if to_status == StudentLessonStatus.IN_PROGRESS:
        _transition(student_lesson, actor, StudentLessonStatus.IN_PROGRESS)
        student_lesson.save()
    elif to_status == StudentLessonStatus.COMPLETED:
        mark_completed(student_lesson, actor, grade_points=grade_points, grade_result=grade_result)
    else:
        raise InvalidTransition(f'NeedHelp cannot resolve to {to_status!r}')


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
    mark_completed(student_lesson, actor, grade_points=grade_points, grade_result=grade_result)


def request_revision(student_lesson: StudentLesson, actor: User, feedback: str) -> None:
    _guard_status(student_lesson, StudentLessonStatus.PENDING_REVIEW)
    student_lesson.tutor_feedback = feedback
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


def reschedule(student_lesson: StudentLesson, new_date) -> None:
    """Manual single-lesson reschedule, called from scheduling's
    POST /student-lessons/{id}/reschedule. Not allowed once completed — see
    docs/architecture/02-data-model.md decision 5."""
    if student_lesson.status == StudentLessonStatus.COMPLETED:
        raise InvalidTransition('Cannot reschedule a completed lesson')
    student_lesson.scheduled_date = new_date
    student_lesson.is_manually_scheduled = True
    student_lesson.save(update_fields=['scheduled_date', 'is_manually_scheduled'])


def sync_scheduled_lesson(
    student: StudentProfile, lesson: Lesson, scheduled_date, subject_block=None
) -> StudentLesson:
    """Create-or-update a StudentLesson's scheduled_date for calendar
    generation/recalculation (scheduling.services). Skips existing rows that
    are completed or manually scheduled, and never overwrites subject_block
    once set (immutable — decision 4). See
    docs/architecture/08-calendar-generation.md."""
    student_lesson, created = StudentLesson.objects.get_or_create(
        student=student,
        lesson=lesson,
        defaults={'scheduled_date': scheduled_date, 'subject_block': subject_block},
    )
    if created:
        return student_lesson

    if student_lesson.status == StudentLessonStatus.COMPLETED or student_lesson.is_manually_scheduled:
        return student_lesson

    student_lesson.scheduled_date = scheduled_date
    if subject_block is not None and student_lesson.subject_block_id is None:
        student_lesson.subject_block = subject_block
    student_lesson.save(update_fields=['scheduled_date', 'subject_block'])
    return student_lesson
