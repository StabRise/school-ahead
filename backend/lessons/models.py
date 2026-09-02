from academics.models import Subject, SubjectBlock, Topic
from accounts.models import StudentProfile, User
from common.models import TimeStampedModel
from common.storage import (
    lesson_attachment_upload_to,
    lesson_icon_upload_to,
    lesson_submission_upload_to,
    lessons_json_upload_to,
    quiz_choice_image_upload_to,
    tutor_feedback_image_upload_to,
)
from django.db import models


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


class QuizLanguage(models.TextChoices):
    # Matches the Piper voices wired up on the frontend (see
    # frontend/lib/balloon-tts.ts) — used to read the question and its
    # answers aloud in the preschool quiz.
    UK = 'uk', 'Ukrainian'
    EN = 'en', 'English'
    PL = 'pl', 'Polish'


class Lesson(TimeStampedModel):
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name='lessons')
    order_index = models.PositiveSmallIntegerField()
    # Generated curriculum titles can run long (e.g. "Урок 6. Види
    # декоративно-ужиткового мистецтва (...)"), so this is wider than the
    # usual 255-char title field.
    title = models.CharField(max_length=512)
    lesson_type = models.CharField(max_length=10, choices=LessonType.choices)
    grading_type = models.CharField(max_length=10, choices=GradingType.choices)
    content = models.TextField(blank=True)
    # Only populated when lesson_type=WITH_TASK — shown on the wizard's
    # second screen (the submission step), separate from `content` which is
    # the first-screen theory/materials page.
    task_content = models.TextField(blank=True)
    default_day_offset = models.PositiveSmallIntegerField(null=True, blank=True)
    # Step-node icon for the preschool game map — falls back to the
    # subject's icon, then a frontend default, when empty. See
    # docs/interfaces/preschool.md.
    icon = models.FileField(upload_to=lesson_icon_upload_to, blank=True)

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
    # Spoken language for the "read aloud" button on the preschool quiz
    # screen. Defaults to Ukrainian; a tutor can set it per question, e.g.
    # for a lesson that teaches English vocabulary.
    language = models.CharField(max_length=2, choices=QuizLanguage.choices, default=QuizLanguage.UK)

    class Meta:
        ordering = ['order_index']


class QuizChoice(models.Model):
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name='choices')
    # Markdown, like prompt and every other tutor-authored text field — the
    # student-facing renderer embeds it via <Markdown>.
    text = models.TextField()
    # When set, the student-facing card shows this image instead of `text`
    # (e.g. a picture of a mitten instead of the word "mitten").
    image = models.FileField(upload_to=quiz_choice_image_upload_to, blank=True)
    is_correct = models.BooleanField(default=False)


class StudentLesson(TimeStampedModel):
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name='student_lessons'
    )
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='student_lessons')
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


class MaterialLanguage(models.TextChoices):
    # Matches frontend/lib/piper-tts.ts's SpeechLanguage — the read-along
    # tool's TTS language for this material's content.
    EN = 'en', 'English'
    UK = 'uk', 'Ukrainian'
    PL = 'pl', 'Polish'


class StudentLessonMaterial(models.Model):
    """A reading material a student saved from the read-along tool
    (frontend's /read-along page, "Додати в урок" button) onto one of their
    own assigned lessons — shown in the lesson wizard's "Матеріали" tab
    (distinct from LessonAttachment, the tutor-authored materials shown on
    the "Теорія" tab). `content` stores the exact block structure the
    read-along viewer already renders/plays (heading/paragraph/image,
    pre-split into sentences — see frontend/lib/reading-blocks.ts's
    ReadingBlock), so the Materials tab needs no conversion to reuse the
    same playback components. `source_url` is set when the student saved it
    from a pasted link rather than pasted text."""
    student_lesson = models.ForeignKey(StudentLesson, on_delete=models.CASCADE, related_name='materials')
    title = models.CharField(max_length=255, blank=True)
    content = models.JSONField()
    source_url = models.URLField(blank=True)
    language = models.CharField(max_length=2, choices=MaterialLanguage.choices)
    order_index = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order_index', 'created_at']

    def __str__(self):
        return self.title or f'Material #{self.pk}'


class MaterialAnnotationKind(models.TextChoices):
    RECTANGLE = 'rectangle', 'Rectangle'
    ELLIPSE = 'ellipse', 'Ellipse'
    FREEHAND = 'freehand', 'Freehand'
    TEXT_NOTE = 'text_note', 'Text note'
    HIGHLIGHT = 'highlight', 'Highlight'
    COMMENT = 'comment', 'Comment'


class MaterialAnnotation(models.Model):
    """A drawing, highlight, or comment a student added on their own
    StudentLessonMaterial (components/lesson-wizard/material-annotation-
    panel.tsx + annotation-canvas.tsx), persisted so it's still there next
    visit. Shapes (rectangle/ellipse/freehand/text_note) store `geometry` as
    fractional (0..1) coordinates relative to the material content's
    rendered box, so placement survives different viewport widths:
    rectangle/ellipse -> {x, y, width, height}; freehand ->
    {points: [{x, y}, ...]}; text_note -> {x, y} (its text goes in `body`,
    the same field comment uses). highlight/comment instead anchor to a
    sentence range (sentence_start/sentence_end — indices into the
    material's flattened block sentences, see
    frontend/lib/reading-blocks.ts's flatSentencesOf), since a material's
    content never changes once saved."""
    material = models.ForeignKey(StudentLessonMaterial, on_delete=models.CASCADE, related_name='annotations')
    kind = models.CharField(max_length=10, choices=MaterialAnnotationKind.choices)
    color = models.CharField(max_length=7, blank=True)
    geometry = models.JSONField(null=True, blank=True)
    sentence_start = models.PositiveIntegerField(null=True, blank=True)
    sentence_end = models.PositiveIntegerField(null=True, blank=True)
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.kind} on material #{self.material_id}'


class LessonSubmission(models.Model):
    student_lesson = models.ForeignKey(StudentLesson, on_delete=models.CASCADE, related_name='submissions')
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


class LessonSubmissionFile(models.Model):
    """One of possibly several files a student attached to a single
    LessonSubmission — see submit_task/resubmit, which accept a list of
    uploads rather than one."""
    submission = models.ForeignKey(LessonSubmission, on_delete=models.CASCADE, related_name='files')
    file = models.FileField(upload_to=lesson_submission_upload_to)

    class Meta:
        ordering = ['id']


class LessonSubmissionFeedbackImage(models.Model):
    """One of possibly several marked-up screenshots (freehand pen/arrows/
    text) the tutor drew instead of — or alongside — a written reply. See
    components/tutor/annotatable-image-lightbox.tsx, which lets the tutor
    attach more than one."""
    submission = models.ForeignKey(LessonSubmission, on_delete=models.CASCADE, related_name='tutor_feedback_images')
    file = models.FileField(upload_to=tutor_feedback_image_upload_to)

    class Meta:
        ordering = ['id']


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


class TopicCompletionBonus(models.Model):
    """One row per (student, Topic) once services._award_topic_completion_
    diamonds has paid out that topic's +5 bonus — exists purely as an
    idempotency guard (via the unique_together below), not an audit ledger:
    a Lesson added to a Topic after it was already fully completed would
    otherwise let completing that new lesson re-trigger the bonus. See
    lessons.services._award_topic_completion_diamonds."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='topic_completion_bonuses')
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name='completion_bonuses')
    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('student', 'topic')]

    def __str__(self):
        return f'{self.student} — {self.topic}'


class SemesterCompletionBonus(models.Model):
    """Same idempotency-guard role as TopicCompletionBonus, one row per
    (student, SubjectBlock) once the +10 "semester" bonus has been paid.
    See lessons.services._award_semester_completion_diamonds."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='semester_completion_bonuses')
    subject_block = models.ForeignKey(SubjectBlock, on_delete=models.CASCADE, related_name='completion_bonuses')
    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('student', 'subject_block')]

    def __str__(self):
        return f'{self.student} — {self.subject_block}'


class LessonsJsonStatus(models.TextChoices):
    NEW = 'new', 'New'
    PROCESSED = 'processed', 'Processed'


class LessonsJson(TimeStampedModel):
    """A scrape_lessons JSON upload (list of TopicOut) staged for
    import_lessons — tracks which Subject it targets, the Lessons it ended
    up creating once processed, and whether it's been processed yet."""

    # Tutor-facing label — on-disk filenames are anonymized hex (see
    # common.storage._unique_path), so this is what actually tells uploads
    # apart in the admin and the "Load lessons from JSON" picker.
    name = models.CharField(max_length=255, default='json')
    description = models.TextField(blank=True)
    json_file = models.FileField(upload_to=lessons_json_upload_to)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='lessons_json_uploads')
    lessons = models.ManyToManyField(Lesson, blank=True, related_name='lessons_json_uploads')
    status = models.CharField(max_length=10, choices=LessonsJsonStatus.choices, default=LessonsJsonStatus.NEW)

    def __str__(self):
        return f'{self.name} — {self.subject} ({self.status})'
