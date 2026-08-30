from common.models import TimeStampedModel
from django.db import models
from lessons.models import QuizLanguage

from .piper_voices import PIPER_VOICE_CHOICES


class TtsVoiceProfile(models.TextChoices):
    # Mirrors frontend's VoiceProfile (frontend/lib/piper-tts.ts) — SHORT is
    # for single digits/letters/colors (the balloon-pop game), SENTENCE for
    # full phrases (quiz questions/answers, lesson titles).
    SHORT = 'short', 'Short (digits/letters/colors)'
    SENTENCE = 'sentence', 'Sentence (full phrases)'


class TtsVoiceSetting(TimeStampedModel):
    """Which Piper voice (see tts/piper_voices.py, generated from
    https://huggingface.co/rhasspy/piper-voices) the frontend should use for
    a given language/profile pair. Read by GET /api/tts/voices;
    frontend/lib/piper-tts.ts falls back to its own hardcoded defaults for
    any language/profile with no row here yet."""

    language = models.CharField(max_length=2, choices=QuizLanguage.choices)
    profile = models.CharField(max_length=16, choices=TtsVoiceProfile.choices)
    voice_id = models.CharField(max_length=64, choices=PIPER_VOICE_CHOICES)

    class Meta:
        unique_together = ('language', 'profile')
        ordering = ('language', 'profile')

    def __str__(self):
        return f'{self.get_language_display()} / {self.get_profile_display()}: {self.voice_id}'
