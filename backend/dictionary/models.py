from django.db import models

from accounts.models import StudentProfile
from lessons.models import MaterialLanguage


class DictionaryItemStatus(models.TextChoices):
    NEW = 'new', 'New'
    IN_PROGRESS = 'in_progress', 'In progress'
    KNOWN = 'known', 'Already know'


class DictionaryItem(models.Model):
    """A word or short phrase a student saved to their personal dictionary
    while translating text — see the "Додати до словника" icon button on
    frontend/components/read-along-content.tsx's translation popup, offered
    only for a 1-5 word selection (enforced server-side below, not just in
    the frontend). `sample`/`sample_translation` keep the full sentence the
    word/phrase came from (and its translation) for context. Deliberately no
    FK to StudentLessonMaterial: a dictionary entry should survive the
    source material being edited or deleted."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='dictionary_items')
    text = models.CharField(max_length=255)
    lang = models.CharField(max_length=2, choices=MaterialLanguage.choices)
    translation = models.CharField(max_length=255)
    sample = models.TextField()
    sample_translation = models.TextField()
    status = models.CharField(max_length=12, choices=DictionaryItemStatus.choices, default=DictionaryItemStatus.NEW)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.text} ({self.lang})'
