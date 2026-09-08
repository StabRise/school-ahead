from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from academics.models import Subject, Topic
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import get_own_student_profile
from tutoring.services import ensure_is_tutor_for_subject, get_tutor_subject_ids

from . import services
from .models import Task, TaskCompletion, TaskKind, TaskSubmission
from .schemas import TaskImportSummaryOut, TaskOut, TaskProgressOut

router = Router(tags=['tasks'], auth=CookieOrBearerJWTAuth())


def _get_own_student_in_subject_class(request: HttpRequest, subject_id: int):
    """403s unless the caller is a student enrolled in this subject's
    class (mirrors academics.api.my_subjects' scoping). Returns the
    StudentProfile."""
    student = get_own_student_profile(request)
    subject = get_object_or_404(Subject, id=subject_id)
    if student.school_class_id != subject.school_class_id:
        raise HttpError(403, 'Not a student in this subject')
    return student


def _get_student_if_viewer_can_see_subject_tasks(request: HttpRequest, subject_id: int):
    """403s unless the caller is either a student enrolled in this
    subject's class or a tutor assigned to it — the Tasks tab is shared by
    both the student's and the tutor's Subject detail pages. Returns the
    StudentProfile for is_done annotation, or None for a tutor (who has no
    single student's completion state to show)."""
    student_profile = getattr(request.auth, 'student_profile', None)
    if student_profile is not None:
        subject = get_object_or_404(Subject, id=subject_id)
        if student_profile.school_class_id == subject.school_class_id:
            return student_profile

    if subject_id in get_tutor_subject_ids(request.auth):
        return None

    raise HttpError(403, 'Not a student or tutor for this subject')


def _get_task_for_student(request: HttpRequest, task_id: int) -> tuple[Task, object]:
    task = get_object_or_404(Task.objects.select_related('topic__subject'), id=task_id)
    student = get_own_student_profile(request)
    if student.school_class_id != task.topic.subject.school_class_id:
        raise HttpError(403, 'Not a student in this subject')
    return task, student


def _get_student_if_viewer_can_see_task(request: HttpRequest, task: Task):
    """Same dual student-or-tutor scoping as
    _get_student_if_viewer_can_see_subject_tasks, for a single Task — the
    detail page is reachable from both the student's and (in principle) the
    tutor's Tasks tab."""
    student_profile = getattr(request.auth, 'student_profile', None)
    if student_profile is not None and student_profile.school_class_id == task.topic.subject.school_class_id:
        return student_profile

    if task.topic.subject_id in get_tutor_subject_ids(request.auth):
        return None

    raise HttpError(403, 'Not a student or tutor for this subject')


@router.get('/subjects/{subject_id}', response=list[TaskOut], operation_id='list_subject_tasks')
def list_subject_tasks(request: HttpRequest, subject_id: int):
    """Shared by the student's and the tutor's Subject detail pages — see
    _get_student_if_viewer_can_see_subject_tasks. A tutor sees every task
    with is_done always False (there's no single student's completion state
    to show them)."""
    student = _get_student_if_viewer_can_see_subject_tasks(request, subject_id)

    tasks = list(Task.objects.filter(topic__subject_id=subject_id).select_related('topic__subject'))
    done_ids = (
        set(
            TaskCompletion.objects.filter(student=student, task_id__in=[t.id for t in tasks]).values_list(
                'task_id', flat=True
            )
        )
        if student is not None
        else set()
    )
    for task in tasks:
        task.is_done = task.id in done_ids
    return tasks


@router.get('/tasks/{task_id}', response=TaskOut, operation_id='get_task')
def get_task(request: HttpRequest, task_id: int):
    """The student's Task detail page — content plus, for a student, their
    own is_done state and any TaskSubmission they've already made."""
    task = get_object_or_404(Task.objects.select_related('topic__subject'), id=task_id)
    student = _get_student_if_viewer_can_see_task(request, task)

    task.is_done = student is not None and TaskCompletion.objects.filter(student=student, task=task).exists()
    task.my_submission = (
        TaskSubmission.objects.filter(student=student, task=task).first() if student is not None else None
    )
    return task


@router.post('/tasks/{task_id}/submission', response=TaskOut, operation_id='submit_task_answer')
def submit_task_answer(
    request: HttpRequest, task_id: int, text: str = Form(''), file: UploadedFile | None = File(None)
):
    """Upserts the student's optional free-text answer and/or attached file
    for a Task — independent of complete_task/uncomplete_task, a student
    can submit an answer without marking the task done or vice versa.
    Resubmitting replaces the previous text/file rather than keeping a
    history (no tutor review workflow here)."""
    require_csrf(request)
    task, student = _get_task_for_student(request, task_id)
    if not text and file is None:
        raise HttpError(400, 'text or file is required')

    submission, _created = TaskSubmission.objects.get_or_create(task=task, student=student)
    submission.text = text
    if file is not None:
        submission.file = file
    submission.save()

    task.is_done = TaskCompletion.objects.filter(student=student, task=task).exists()
    task.my_submission = submission
    return task


@router.get(
    '/subjects/{subject_id}/progress', response=TaskProgressOut, operation_id='get_subject_task_progress'
)
def get_subject_task_progress(request: HttpRequest, subject_id: int):
    student = _get_own_student_in_subject_class(request, subject_id)
    completed, total, percent = services.compute_task_progress(subject_id, student)
    return TaskProgressOut(completed_count=completed, total_count=total, completed_percent=percent)


@router.post(
    '/subjects/{subject_id}/import-markdown',
    response=TaskImportSummaryOut,
    operation_id='import_subject_tasks_markdown',
)
def import_subject_tasks_markdown(request: HttpRequest, subject_id: int, file: UploadedFile = File(...)):
    """The tutor's "Завантажити завдання з Markdown" button on the Subject
    detail page's Tasks tab — one `## <topic>` heading per Topic (reused by
    exact title match, created otherwise), one Task per non-blank line
    under it. See tasks.services.parse_tasks_markdown/import_tasks_markdown
    and backend/scraped.tmp/!plans/7 PL/math7 task.md for the file shape."""
    require_csrf(request)
    ensure_is_tutor_for_subject(request, subject_id)
    subject = get_object_or_404(Subject, id=subject_id)

    text = file.read().decode('utf-8')
    sections = services.parse_tasks_markdown(text)
    summary = services.import_tasks_markdown(subject, sections)
    return TaskImportSummaryOut(
        topics_created=summary.topics_created,
        topics_reused=summary.topics_reused,
        tasks_created=summary.tasks_created,
        tasks_skipped=summary.tasks_skipped,
    )


@router.post('/tasks', response=TaskOut, operation_id='create_task')
def create_task(
    request: HttpRequest,
    topic_id: int = Form(...),
    title: str = Form(...),
    kind: str = Form(...),
    content: str = Form(''),
    order_index: int = Form(0),
    image: UploadedFile | None = File(None),
):
    require_csrf(request)
    if kind not in TaskKind.values:
        raise HttpError(400, f'Invalid kind: {kind!r}')
    topic = get_object_or_404(Topic, id=topic_id)
    ensure_is_tutor_for_subject(request, topic.subject_id)

    task = Task(topic=topic, title=title, kind=kind, content=content, order_index=order_index)
    if image is not None:
        task.image = image
    task.save()
    task.is_done = False
    return task


@router.patch('/tasks/{task_id}', response=TaskOut, operation_id='update_task')
def update_task(
    request: HttpRequest,
    task_id: int,
    topic_id: int = Form(...),
    title: str = Form(...),
    kind: str = Form(...),
    content: str = Form(''),
    order_index: int = Form(0),
    image: UploadedFile | None = File(None),
):
    require_csrf(request)
    if kind not in TaskKind.values:
        raise HttpError(400, f'Invalid kind: {kind!r}')
    task = get_object_or_404(Task.objects.select_related('topic'), id=task_id)
    ensure_is_tutor_for_subject(request, task.topic.subject_id)

    if topic_id != task.topic_id:
        topic = get_object_or_404(Topic, id=topic_id)
        ensure_is_tutor_for_subject(request, topic.subject_id)
        task.topic = topic
    task.title = title
    task.kind = kind
    task.content = content
    task.order_index = order_index
    if image is not None:
        task.image = image
    task.save()
    task.is_done = False
    return task


@router.delete('/tasks/{task_id}', operation_id='delete_task')
def delete_task(request: HttpRequest, task_id: int, response: HttpResponse):
    require_csrf(request)
    task = get_object_or_404(Task.objects.select_related('topic'), id=task_id)
    ensure_is_tutor_for_subject(request, task.topic.subject_id)
    task.delete()
    response.status_code = 204
    return response


@router.post('/tasks/{task_id}/complete', response=TaskOut, operation_id='complete_task')
def complete_task(request: HttpRequest, task_id: int):
    require_csrf(request)
    task, student = _get_task_for_student(request, task_id)
    TaskCompletion.objects.get_or_create(student=student, task=task)
    task.is_done = True
    return task


@router.delete('/tasks/{task_id}/complete', response=TaskOut, operation_id='uncomplete_task')
def uncomplete_task(request: HttpRequest, task_id: int):
    require_csrf(request)
    task, student = _get_task_for_student(request, task_id)
    TaskCompletion.objects.filter(student=student, task=task).delete()
    task.is_done = False
    return task
