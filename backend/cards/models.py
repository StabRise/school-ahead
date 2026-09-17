from django.db import models

from academics.models import Subject
from accounts.models import StudentProfile
from common.models import TimeStampedModel
from lessons.models import Lesson


class StudentCustomTopic(models.Model):
    """One "set" (the Topic-equivalent) an imported flashcard deck's
    top-level title didn't resolve to a real Topic under (see
    services.import_card_set — the frontend's "load set from json file"
    button). Always tied to a real `subject` the student picked/was viewing
    at import time (so the cards still show up on that Subject's own
    Картки tab) even though the topic itself is personal — deliberately
    NOT a real academics.Topic: no order_index/subject_block/schedule, so
    an import can never leak into a class's course listing, schedule, or
    completion % the way creating a real Topic would."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='custom_topics')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='student_custom_topics')
    title = models.CharField(max_length=255)

    class Meta:
        unique_together = [('student', 'subject', 'title')]
        ordering = ['title']

    def __str__(self):
        return f'{self.title} ({self.subject})'


class StudentCustomLesson(models.Model):
    """One "category" (the Lesson-equivalent) within a StudentCustomTopic —
    e.g. an imported set.json category title that didn't resolve to a real
    Lesson (either because its parent topic itself didn't match, or the
    topic matched but this particular lesson title didn't)."""

    topic = models.ForeignKey(StudentCustomTopic, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=255)
    # Append order per topic, in import order — see services.import_card_set.
    order_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = [('topic', 'title')]
        ordering = ['order_index', 'id']

    def __str__(self):
        return f'{self.title} — {self.topic}'


class StudentCard(TimeStampedModel):
    """A word/phrase a student saved as a personal flashcard — either while
    translating a lesson's Теорія content, конспект, or Матеріали (the
    "Додати до карток" icon button, a sibling of dictionary's "Додати до
    словника" one — see frontend's translatable-content.tsx /
    read-along-content.tsx), or in bulk via services.import_card_set. A
    card is filed into the "Cards" game's Group/Set/Category structure via
    exactly one of `lesson` (a real curriculum Lesson: Subject = group,
    Topic = set, Lesson = category) or `custom_lesson` (an imported card
    whose topic/lesson names didn't match real curriculum ones — see
    StudentCustomTopic/StudentCustomLesson above), enforced by the
    CheckConstraint below. See cards/api.py's group/set endpoints and
    frontend's lib/flashcards.ts."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='cards')
    lesson = models.ForeignKey(
        Lesson, on_delete=models.CASCADE, null=True, blank=True, related_name='student_cards'
    )
    custom_lesson = models.ForeignKey(
        StudentCustomLesson, on_delete=models.CASCADE, null=True, blank=True, related_name='student_cards'
    )
    term = models.CharField(max_length=255)
    translation = models.CharField(max_length=255)
    # The sample sentence the word came from, for context — same idea as
    # DictionaryItem.sample, but optional here since a card is meant to be
    # a quick study aid, not necessarily a full example sentence.
    definition = models.TextField(blank=True)
    # Append order per (student, lesson) or (student, custom_lesson) — see
    # cards/services.py::add_card/import_card_set, same .count()-based
    # pattern as lessons/services.py::add_material.
    order_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order_index', 'created_at']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(lesson__isnull=False, custom_lesson__isnull=True)
                    | models.Q(lesson__isnull=True, custom_lesson__isnull=False)
                ),
                name='studentcard_exactly_one_lesson_source',
            )
        ]

    def __str__(self):
        return f'{self.term} -> {self.translation}'
