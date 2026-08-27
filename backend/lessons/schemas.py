import datetime

from ninja import Schema


def _absolute_file_url(file_field, context: dict) -> str | None:
    """FieldFile.url is host-relative (e.g. '/media/...') — the frontend is
    a separate origin from Django (no BFF, see
    docs/architecture/06-frontend-architecture.md), so links need the
    request's actual host to resolve. `context` is ninja's per-request
    serialization context (see ninja.operation), available to any
    resolve_* method that declares a `context` parameter."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class QuizChoiceOut(Schema):
    id: int
    text: str
    image: str | None

    @staticmethod
    def resolve_image(obj, context):
        return _absolute_file_url(obj.image, context)


class QuizQuestionOut(Schema):
    id: int
    prompt: str
    order_index: int
    language: str
    choices: list[QuizChoiceOut]

    @staticmethod
    def resolve_choices(obj):
        # Never expose is_correct to the student.
        return list(obj.choices.all())


class LessonAttachmentOut(Schema):
    id: int
    file: str | None
    url: str
    kind: str
    title: str
    order_index: int

    @staticmethod
    def resolve_file(obj, context):
        return _absolute_file_url(obj.file, context)


class LessonOut(Schema):
    id: int
    topic_id: int
    order_index: int
    title: str
    lesson_type: str
    grading_type: str
    content: str
    task_content: str
    materials: list[LessonAttachmentOut]
    quiz_questions: list[QuizQuestionOut]
    subject_id: int
    subject_name: str
    class_name: str
    topic_title: str
    subject_block_label: str | None
    icon: str | None

    @staticmethod
    def resolve_materials(obj):
        return list(obj.materials.all())

    @staticmethod
    def resolve_icon(obj, context):
        return _absolute_file_url(obj.icon, context)

    @staticmethod
    def resolve_quiz_questions(obj):
        return list(obj.quiz_questions.all())

    @staticmethod
    def resolve_subject_id(obj):
        return obj.topic.subject_id

    @staticmethod
    def resolve_subject_name(obj):
        return obj.topic.subject.name

    @staticmethod
    def resolve_class_name(obj):
        return obj.topic.subject.school_class.name

    @staticmethod
    def resolve_topic_title(obj):
        return obj.topic.title

    @staticmethod
    def resolve_subject_block_label(obj):
        # Every Lesson in a Topic shares that Topic's block — see
        # academics.services.assign_topics_to_blocks.
        return obj.topic.subject_block.label if obj.topic.subject_block else None


class LessonUpdateIn(Schema):
    """Inline editing from the tutor's Lesson detail page — title, content,
    task_content, lesson_type, grading_type. Quiz questions/choices aren't
    editable here yet, so this never touches them."""

    title: str
    content: str
    task_content: str = ''
    lesson_type: str
    grading_type: str


class LessonSubmissionOut(Schema):
    id: int
    file: str | None
    comment: str
    submitted_at: datetime.datetime
    is_latest: bool
    tutor_feedback: str
    feedback_at: datetime.datetime | None

    @staticmethod
    def resolve_file(obj, context):
        return _absolute_file_url(obj.file, context)


class StudentLessonOut(Schema):
    id: int
    lesson: LessonOut
    status: str
    scheduled_date: datetime.date
    is_manually_scheduled: bool
    started_at: datetime.datetime | None
    completed_at: datetime.datetime | None
    grade_points: int | None
    grade_result: str | None
    quiz_score_percent: float | None
    attempt_count: int
    help_note: str
    tutor_feedback: str
    submissions: list[LessonSubmissionOut]

    @staticmethod
    def resolve_submissions(obj):
        # Oldest first — the frontend renders this as a chat-like thread of
        # work + the tutor's reply threaded directly under it.
        return list(obj.submissions.order_by('submitted_at'))


class SubmitQuizIn(Schema):
    answers: dict[int, int]


class SubmitQuizOut(Schema):
    score_percent: float
    student_lesson: StudentLessonOut


class QuizHintOut(Schema):
    """Reveals a single question's correct choice on demand — used by the
    preschool quiz's raccoon mascot to nudge a stuck child toward the answer.
    Deliberately a separate, per-question, on-demand endpoint rather than a
    field on QuizQuestionOut, so the answer key is never shipped up front
    (see QuizQuestionOut.resolve_choices)."""

    correct_choice_id: int | None


class ConfirmUnderstandingIn(Schema):
    understood: bool


class RequestHelpIn(Schema):
    note: str = ''


class LessonCommentOut(Schema):
    id: int
    author_id: int | None
    author_name: str
    author_role: str
    kind: str
    body: str
    is_resolved: bool
    resolved_at: datetime.datetime | None
    reply_to_id: int | None
    created_at: datetime.datetime

    @staticmethod
    def resolve_author_name(obj):
        if obj.author is None:
            return ''
        return obj.author.full_name or obj.author.email

    @staticmethod
    def resolve_author_role(obj):
        return obj.author.role if obj.author else ''


class AddCommentIn(Schema):
    body: str


class CompletionProgressOut(Schema):
    """Curriculum-wide completion, not just what's been scheduled so far —
    see lessons.services.compute_completion. Powers the Subject/Topic detail
    pages' progress bars (docs/interfaces/student/subjects.md)."""

    completed_count: int
    total_count: int
    completed_percent: float


class TopicLessonOut(Schema):
    """One row of the Topic detail page's paginated lessons table, and of the
    Subject detail page's "Course plan" accordion — `id` is the StudentLesson
    id (what the row links to), not the Lesson id. subject_block_label is
    constant across every row (a Topic belongs to exactly one SubjectBlock),
    included per-row for a "Subject block" table column per
    docs/interfaces/student/subjects.md."""

    id: int
    lesson_id: int
    title: str
    order_index: int
    status: str
    lesson_type: str
    task_content: str
    scheduled_date: datetime.date
    grade_points: int | None
    grade_result: str | None
    subject_block_label: str | None

    @staticmethod
    def resolve_lesson_id(obj):
        return obj.lesson_id

    @staticmethod
    def resolve_title(obj):
        return obj.lesson.title

    @staticmethod
    def resolve_order_index(obj):
        return obj.lesson.order_index

    @staticmethod
    def resolve_lesson_type(obj):
        return obj.lesson.lesson_type

    @staticmethod
    def resolve_task_content(obj):
        return obj.lesson.task_content

    @staticmethod
    def resolve_subject_block_label(obj):
        return obj.lesson.topic.subject_block.label if obj.lesson.topic.subject_block else None


class SubjectLessonOut(Schema):
    """Every Lesson in a subject, not just the ones scheduled for the
    requesting student — powers the Subject detail page's Course plan, which
    shows the whole curriculum (including not-yet-assigned lessons) grouped
    by topic and semester like the tutor's equivalent view. `student_lesson_id`
    and `status` are null when this student has no StudentLesson for the
    lesson yet — the frontend renders those as unopenable (see
    docs/interfaces/student/subjects_list.md)."""

    id: int
    topic_id: int
    order_index: int
    title: str
    lesson_type: str
    task_content: str
    student_lesson_id: int | None
    status: str | None
    scheduled_date: datetime.date | None
    grade_points: int | None
    grade_result: str | None


class NextLessonOut(Schema):
    """The student's next actionable lesson within a subject — the earliest
    (by topic order, then lesson order) StudentLesson that isn't completed
    yet. All lessons are always open (no unlocking/blocking), so this is a
    suggestion for the Subject detail page's hero card, not a gate — see
    docs/interfaces/student/subjects_list.md."""

    id: int
    lesson_id: int
    title: str
    status: str
    lesson_type: str
    scheduled_date: datetime.date
    topic_id: int
    topic_title: str
    subject_block_label: str | None
    task_content: str

    @staticmethod
    def resolve_lesson_id(obj):
        return obj.lesson_id

    @staticmethod
    def resolve_title(obj):
        return obj.lesson.title

    @staticmethod
    def resolve_lesson_type(obj):
        return obj.lesson.lesson_type

    @staticmethod
    def resolve_topic_id(obj):
        return obj.lesson.topic_id

    @staticmethod
    def resolve_topic_title(obj):
        return obj.lesson.topic.title

    @staticmethod
    def resolve_subject_block_label(obj):
        return obj.lesson.topic.subject_block.label if obj.lesson.topic.subject_block else None

    @staticmethod
    def resolve_task_content(obj):
        return obj.lesson.task_content


class LessonsJsonOut(Schema):
    """A scrape_lessons JSON upload staged for import — powers the tutor's
    "Load lessons from JSON" dialog picker on the Subject detail page."""

    id: int
    subject_id: int
    name: str
    description: str
    status: str
    file_name: str
    file_url: str | None
    created_at: datetime.datetime

    @staticmethod
    def resolve_file_name(obj):
        return obj.json_file.name.rsplit('/', 1)[-1] if obj.json_file else ''

    @staticmethod
    def resolve_file_url(obj, context):
        return _absolute_file_url(obj.json_file, context)


class ProcessLessonsJsonOut(Schema):
    lessons_json_id: int
    status: str
    topics_created: int
    topics_reused: int
    lessons_created: int
    lessons_skipped: int
