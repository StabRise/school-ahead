"""Imports the TopicOut/LessonOut JSON produced by scrape_lessons into a
Subject — reusing an existing Topic by title where one already exists,
otherwise creating it, then creating any Lesson under it that isn't already
there (matched by title). Shares its creation logic with the tutor "Load
lessons from JSON" dialog — see lessons.services.import_topics_and_lessons.

Usage:
    uv run manage.py import_lessons <subject_id> <filename>

<filename> is the same `name` passed to scrape_lessons — read from
scraped.tmp/<filename>.json.
"""

import json
from pathlib import Path

from academics.models import Subject
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from lessons import services as lesson_services


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

        with transaction.atomic():
            summary = lesson_services.import_topics_and_lessons(subject, topics_data)

        self.stdout.write(
            self.style.SUCCESS(
                f'Topics: {summary.topics_created} created, {summary.topics_reused} reused. '
                f'Lessons: {len(summary.lessons_created)} created, {summary.lessons_skipped} skipped (already existed).'
            )
        )

    def _load(self, filename: str) -> list[dict]:
        path = Path(settings.BASE_DIR) / 'scraped.tmp' / (filename if filename.endswith('.json') else f'{filename}.json')
        if not path.exists():
            raise CommandError(f'{path} does not exist — run scrape_lessons first')
        return json.loads(path.read_text(encoding='utf-8'))
