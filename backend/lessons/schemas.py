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


class QuizQuestionOut(Schema):
    id: int
    prompt: str
    order_index: int
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

    @staticmethod
    def resolve_materials(obj):
        return list(obj.materials.all())

    @staticmethod
    def resolve_quiz_questions(obj):
        return list(obj.quiz_questions.all())


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
