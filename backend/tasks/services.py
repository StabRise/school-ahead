from dataclasses import dataclass

from academics import services as academics_services
from academics.models import Subject, Topic
from accounts.models import StudentProfile
from django.db import transaction
from django.db.models import Max

from .models import Task, TaskCompletion, TaskKind


def compute_task_progress(subject_id: int, student: StudentProfile) -> tuple[int, int, float]:
    """(completed_count, total_count, completed_percent) for every Task
    under `subject_id` — mirrors lessons.services.compute_completion."""
    total = Task.objects.filter(topic__subject_id=subject_id).count()
    completed = TaskCompletion.objects.filter(student=student, task__topic__subject_id=subject_id).count()
    percent = round(completed / total * 100, 1) if total else 0.0
    return completed, total, percent


def _next_order_index(queryset) -> int:
    return (queryset.aggregate(Max('order_index'))['order_index__max'] or 0) + 1


def parse_tasks_markdown(text: str) -> list[tuple[str, list[str]]]:
    """Splits a tutor-authored tasks file into (topic_title, task_lines)
    pairs. Grammar: a `## <topic title>` heading starts a section; every
    non-blank line up to the next heading becomes one Task. Content before
    the first heading (e.g. a 'Class: 8' / 'Subject: ...' header, as in
    scraped.tmp/!plans/7 PL/math7 task.md) is ignored, same as
    academics.services.parse_plan_text ignoring paragraphs before the first
    subject header. A heading with no lines under it (e.g. an empty
    'Algebra' section) still get_or_creates its Topic with zero tasks."""
    sections: list[tuple[str, list[str]]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith('## '):
            if current_title is not None:
                sections.append((current_title, current_lines))
            current_title = line.removeprefix('## ').strip()
            current_lines = []
        elif line and current_title is not None:
            current_lines.append(line)

    if current_title is not None:
        sections.append((current_title, current_lines))

    return sections


@dataclass
class TaskImportSummary:
    topics_created: int = 0
    topics_reused: int = 0
    tasks_created: int = 0
    tasks_skipped: int = 0


def import_tasks_markdown(subject: Subject, sections: list[tuple[str, list[str]]]) -> TaskImportSummary:
    """Imports parse_tasks_markdown's sections into `subject`: get_or_creates
    each Topic by exact title match (mirrors
    lessons.services.import_topics_and_lessons' Topic reuse), then creates
    one markdown Task per line, skipping a line if a Task with that exact
    title already exists under the topic — safe to re-run the same file,
    same idempotency guarantee as import_topics_and_lessons' Lesson dedup."""
    summary = TaskImportSummary()
    next_topic_order = _next_order_index(Topic.objects.filter(subject=subject))

    with transaction.atomic():
        for title, lines in sections:
            topic = Topic.objects.filter(subject=subject, title=title).first()
            if topic is None:
                topic = Topic.objects.create(subject=subject, title=title, order_index=next_topic_order)
                next_topic_order += 1
                summary.topics_created += 1
            else:
                summary.topics_reused += 1

            next_task_order = _next_order_index(Task.objects.filter(topic=topic))
            for line in lines:
                if Task.objects.filter(topic=topic, title=line).exists():
                    summary.tasks_skipped += 1
                    continue
                Task.objects.create(
                    topic=topic, title=line, kind=TaskKind.MARKDOWN, content=line, order_index=next_task_order
                )
                next_task_order += 1
                summary.tasks_created += 1

        academics_services.assign_topics_to_blocks(subject)

    return summary
