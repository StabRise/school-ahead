import datetime

from ninja import Schema


def _absolute_file_url(file_field, context: dict) -> str | None:
    """See lessons/schemas.py's identical helper — every app defines its own
    copy since FieldFile.url is host-relative and the frontend is a
    separate origin."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class TaskSubmissionOut(Schema):
    text: str
    file: str | None
    updated_at: datetime.datetime

    @staticmethod
    def resolve_file(obj, context):
        return _absolute_file_url(obj.file, context)


class TaskOut(Schema):
    id: int
    topic_id: int
    topic_title: str
    subject_id: int
    subject_name: str
    title: str
    kind: str
    content: str
    image: str | None
    order_index: int
    is_done: bool
    my_submission: TaskSubmissionOut | None

    @staticmethod
    def resolve_topic_title(obj, context):
        return obj.topic.title

    @staticmethod
    def resolve_subject_id(obj, context):
        return obj.topic.subject_id

    @staticmethod
    def resolve_subject_name(obj, context):
        # Denormalized for the Task detail page's breadcrumb trail (same
        # idea as lessons.schemas.SubjectLessonOut.topic_title) — a lazy
        # `obj.topic.subject` fetch unless the caller already select_related
        # it, see tasks.api.
        return obj.topic.subject.name

    @staticmethod
    def resolve_image(obj, context):
        return _absolute_file_url(obj.image, context)

    @staticmethod
    def resolve_is_done(obj, context):
        # Annotated onto each Task instance by the list/detail endpoints
        # (one query for the whole list, not one per row) — see
        # tasks.api.list_subject_tasks/get_task.
        return getattr(obj, 'is_done', False)

    @staticmethod
    def resolve_my_submission(obj, context):
        # Only annotated by get_task (the detail page) — the list row no
        # longer needs the full submission, just the done toggle.
        return getattr(obj, 'my_submission', None)


class TaskProgressOut(Schema):
    completed_count: int
    total_count: int
    completed_percent: float


class TaskImportSummaryOut(Schema):
    topics_created: int
    topics_reused: int
    tasks_created: int
    tasks_skipped: int
