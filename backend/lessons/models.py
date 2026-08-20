from django.db import models

from academics.models import SubjectBlock, Topic
from accounts.models import StudentProfile, User
from common.models import TimeStampedModel
from common.storage import lesson_attachment_upload_to, lesson_submission_upload_to


class LessonType(models.TextChoices):
    WITH_QUIZ = 'with_quiz', 'With quiz'
    THEORY = 'theory', 'Theory'
    WITH_TASK = 'with_task', 'With task'


class GradingType(models.TextChoices):
    POINTS = 'points', 'Points (1-12)'
    BINARY = 'binary', 'Pass/Fail'


class StudentLessonStatus(models.TextChoices):
    ASSIGNED = 'assigned', 'Assigned'
    IN_PROGRESS = 'in_progress', 'In Progress'
    NEED_HELP = 'need_help', 'Need Help'
    PENDING_REVIEW = 'pending_review', 'Pending Review'
    REVISION_REQUIRED = 'revision_required', 'Revision Required'
    COMPLETED = 'completed', 'Completed'


class GradeResult(models.TextChoices):
    PASS = 'pass', 'Pass'
    FAIL = 'fail', 'Fail'


class Lesson(TimeStampedModel):
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name='lessons')
    order_index = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=255)
    lesson_type = models.CharField(max_length=10, choices=LessonType.choices)
    grading_type = models.CharField(max_length=10, choices=GradingType.choices)
    content = models.TextField(blank=True)
    # Only populated when lesson_type=WITH_TASK — shown on the wizard's
    # second screen (the submission step), separate from `content` which is
    # the first-screen theory/materials page.
    task_content = models.TextField(blank=True)
    default_day_offset = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        unique_together = [('topic', 'order_index')]
        ordering = ['order_index']

    def __str__(self):
        return f"{self.title} — {self.topic}"


class LessonAttachment(models.Model):
    class Kind(models.TextChoices):
        FILE = 'file', 'File'
        VIDEO = 'video', 'Video'
        LINK = 'link', 'Link'

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='materials')
    file = models.FileField(upload_to=lesson_attachment_upload_to, blank=True)
    url = models.URLField(blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    title = models.CharField(max_length=255, blank=True)
    order_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order_index']


class QuizQuestion(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='quiz_questions')
    prompt = models.TextField()
    order_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order_index']


class QuizChoice(models.Model):
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name='choices')
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)


class StudentLesson(TimeStampedModel):
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name='student_lessons'
    )
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='student_lessons')
    subject_block = models.ForeignKey(
        SubjectBlock, on_delete=models.SET_NULL, null=True, blank=True, related_name='student_lessons'
    )
    status = models.CharField(
        max_length=20, choices=StudentLessonStatus.choices, default=StudentLessonStatus.ASSIGNED,
        db_index=True,
    )
    scheduled_date = models.DateField(db_index=True)
    is_manually_scheduled = models.BooleanField(default=False)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    grade_points = models.PositiveSmallIntegerField(null=True, blank=True)
    grade_result = models.CharField(max_length=4, choices=GradeResult.choices, null=True, blank=True)
    quiz_score_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    help_note = models.TextField(blank=True)
    tutor_feedback = models.TextField(blank=True)

    class Meta:
        unique_together = [('student', 'lesson')]

    def __str__(self):
        return f'{self.student} — {self.lesson} ({self.status})'


class LessonSubmission(models.Model):
    student_lesson = models.ForeignKey(StudentLesson, on_delete=models.CASCADE, related_name='submissions')
    file = models.FileField(upload_to=lesson_submission_upload_to, blank=True)
    comment = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    is_latest = models.BooleanField(default=True)
    # The tutor's reply to *this specific* submission (grade feedback or a
    # revision request) — kept on the submission itself, not just on
    # StudentLesson, so each round of the practical-lesson exchange threads
    # unambiguously under the work it responds to.
    tutor_feedback = models.TextField(blank=True)
    feedback_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-submitted_at']


class StudentLessonStatusEvent(models.Model):
    student_lesson = models.ForeignKey(
        StudentLesson, on_delete=models.CASCADE, related_name='status_events'
    )
    from_status = models.CharField(max_length=20, choices=StudentLessonStatus.choices)
    to_status = models.CharField(max_length=20, choices=StudentLessonStatus.choices)
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['created_at']


class LessonCommentKind(models.TextChoices):
    GENERAL = 'general', 'General'
    HELP_REQUEST = 'help_request', 'Help Request'


class LessonComment(models.Model):
    """Persistent comment thread on a StudentLesson — both students and
    tutors can post at any stage, without affecting `status` (general
    comments), except a `help_request` comment which is created alongside
    the Need-Help status transition and can later be marked resolved when
    the student self-resolves. See the "State Transition & UI Rules" spec
    (sections 2.2, 2.3)."""

    student_lesson = models.ForeignKey(StudentLesson, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='lesson_comments')
    body = models.TextField()
    kind = models.CharField(max_length=20, choices=LessonCommentKind.choices, default=LessonCommentKind.GENERAL)
    is_resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    reply_to = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.kind}: {self.body[:40]}'
