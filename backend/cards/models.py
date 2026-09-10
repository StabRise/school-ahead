from django.db import models

from accounts.models import StudentProfile
from common.models import TimeStampedModel
from lessons.models import Lesson


class StudentCard(TimeStampedModel):
    """A word/phrase a student saved as a personal flashcard while
    translating text in a lesson's Теорія content, конспект, or Матеріали
    (the "Додати до карток" icon button, a sibling of dictionary's
    "Додати до словника" one — see frontend's translatable-content.tsx /
    read-along-content.tsx). Unlike DictionaryItem, deliberately coupled to
    the Lesson it came from: a card needs to know its Topic/Subject to be
    filed into the "Cards" game's Group/Set/Category structure (Subject =
    group, Topic = set, Lesson = category — see cards/api.py's group/set
    endpoints and frontend's lib/flashcards.ts)."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='cards')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='student_cards')
    term = models.CharField(max_length=255)
    translation = models.CharField(max_length=255)
    # The sample sentence the word came from, for context — same idea as
    # DictionaryItem.sample, but optional here since a card is meant to be
    # a quick study aid, not necessarily a full example sentence.
    definition = models.TextField(blank=True)
    # Append order per (student, lesson) — see cards/services.py::add_card,
    # same .count()-based pattern as lessons/services.py::add_material.
    order_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order_index', 'created_at']

    def __str__(self):
        return f'{self.term} -> {self.translation}'
