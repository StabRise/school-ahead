"""Imports the TopicOut/LessonOut JSON produced by scrape_lessons into a
Subject — reusing an existing Topic by title where one already exists,
otherwise creating it, then creating any Lesson under it that isn't already
there (matched by title).

Usage:
    uv run manage.py import_lessons <subject_id> <filename>

<filename> is the same `name` passed to scrape_lessons — read from
scraped.tmp/<filename>.json.
"""

import json
from pathlib import Path

from academics import services as academics_services
from academics.models import Subject, Topic
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import QuerySet

from lessons.models import GradingType, Lesson


class Command(BaseCommand):
    help = 'Import topics/lessons scraped by scrape_lessons into a Subject.'

    def add_arguments(self, parser):
        parser.add_argument('subject_id', type=int, help='Subject to import topics/lessons into.')
        parser.add_argument(
            'filename', help='Name passed to scrape_lessons, read from scraped.tmp/<filename>.json.'
        )

    def handle(self, *args, **options):
        subject_id = options['subject_id']
        filename = options['filename']

        try:
            subject = Subject.objects.get(id=subject_id)
        except Subject.DoesNotExist as exc:
            raise CommandError(f'Subject {subject_id} does not exist') from exc

        topics_data = self._load(filename)

        topics_created = topics_reused = 0
        lessons_created = lessons_skipped = 0

        with transaction.atomic():
            next_topic_order = self._next_order_index(Topic.objects.filter(subject=subject))

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
                    topics_created += 1
                    self.stdout.write(f'Created topic: {topic.title}')
                else:
                    topics_reused += 1
                    self.stdout.write(f'Reusing topic: {topic.title}')

                next_lesson_order = self._next_order_index(Lesson.objects.filter(topic=topic))

                for lesson_data in topic_data.get('lessons', []):
                    if Lesson.objects.filter(topic=topic, title=lesson_data['title']).exists():
                        lessons_skipped += 1
                        self.stdout.write(f"  Skipping existing lesson: {lesson_data['title']}")
                        continue

                    Lesson.objects.create(
                        topic=topic,
                        order_index=next_lesson_order,
                        title=lesson_data['title'],
                        lesson_type=lesson_data['lesson_type'],
                        # Neither lesson_type scrape_lessons produces ('theory',
                        # 'with_task') is auto-graded — both resolve to a
                        # Pass/Fail outcome (docs/core/lessons.md Path B/C).
                        grading_type=GradingType.BINARY,
                        content=lesson_data.get('content', ''),
                        task_content=lesson_data.get('task_content', ''),
                    )
                    next_lesson_order += 1
                    lessons_created += 1
                    self.stdout.write(f"  Created lesson: {lesson_data['title']}")

            academics_services.assign_topics_to_blocks(subject)

        self.stdout.write(
            self.style.SUCCESS(
                f'Topics: {topics_created} created, {topics_reused} reused. '
                f'Lessons: {lessons_created} created, {lessons_skipped} skipped (already existed).'
            )
        )

    def _load(self, filename: str) -> list[dict]:
        path = Path(settings.BASE_DIR) / 'scraped.tmp' / (filename if filename.endswith('.json') else f'{filename}.json')
        if not path.exists():
            raise CommandError(f'{path} does not exist — run scrape_lessons first')
        return json.loads(path.read_text(encoding='utf-8'))

    def _next_order_index(self, queryset: QuerySet) -> int:
        max_index = queryset.order_by('-order_index').values_list('order_index', flat=True).first()
        return (max_index or 0) + 1
