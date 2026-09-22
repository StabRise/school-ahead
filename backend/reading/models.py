from django.db import models

from common.images import SYLLABLE_ICON_SIDE, icon_thumbnail_field
from common.storage import syllable_audio_upload_to, syllable_icon_upload_to, word_audio_upload_to
from lessons.models import QuizLanguage


class Syllable(models.Model):
    """One consonant+vowel syllable card for the "Склади" reading game
    (frontend/packages/preschool-games/src/reading-game.tsx) — e.g.
    `first_letter` `Б` + `second_part` `А` = БА. Only open syllables
    (consonant followed by a single vowel) are taught so far, hence
    `second_part` being just the vowel rather than a longer ending.
    `first_letter` is always rendered blue in the UI, a convention shared
    with the Cards and Stories reading games. `icon` is the picture card
    whose word starts with this syllable (e.g. Банан for БА), drawn in the
    card's bottom-right corner; `word` is that icon's caption and the word
    matched against the syllable during play (see reading-game.tsx's
    match rule: the word's first two letters must equal the syllable).
    Both audio fields are optional, pre-recorded alternatives to the Piper
    TTS voice the game currently synthesizes speech with: `syllable_audio`
    is the syllable spoken aloud (e.g. "Ба"), played on match; `word_audio`
    is `word` spoken aloud (e.g. "Банан"), played to name the icon.

    A syllable can have several cards — e.g. МО has both Морква and
    Морозиво — so (language, first_letter, second_part) is not unique.
    Exactly one card per syllable is flagged `is_default` (enforced by the
    constraint below): the one shown when the game needs a single
    representative card for that syllable rather than the full set."""

    first_letter = models.CharField(max_length=4)
    second_part = models.CharField(max_length=4)
    icon = models.FileField(upload_to=syllable_icon_upload_to, blank=True)
    # What the API sends in place of `icon` — see common/images.py.
    icon_thumbnail = icon_thumbnail_field(SYLLABLE_ICON_SIDE)
    word = models.CharField(max_length=64)
    syllable_audio = models.FileField(upload_to=syllable_audio_upload_to, blank=True)
    word_audio = models.FileField(upload_to=word_audio_upload_to, blank=True)
    language = models.CharField(max_length=2, choices=QuizLanguage.choices, default=QuizLanguage.UK)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ['language', 'first_letter', 'second_part']
        constraints = [
            models.UniqueConstraint(
                fields=['language', 'first_letter', 'second_part'],
                condition=models.Q(is_default=True),
                name='reading_syllable_one_default_per_syllable',
            ),
        ]

    def __str__(self):
        default_marker = ' [default]' if self.is_default else ''
        return f'{self.first_letter}{self.second_part} — {self.word}{default_marker} ({self.language})'
