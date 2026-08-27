from django.db import models


class ProgressBadge(models.Model):
    """Gamified course-level badge shown on a student's Subject detail page
    and the "Мої досягнення" overview, keyed off a subject's overall lesson
    completion percent (every Lesson in the subject, not just assigned ones
    — see lessons.services.compute_completion and
    achievements.services.get_badge_for_percent). name/icon/level are meant
    to be tweaked from the admin; min_percent/max_percent define the tier
    boundaries and aren't expected to change, but are plain fields (not
    hardcoded constants) in case the product ever needs to retune them."""

    name = models.CharField(max_length=100)
    # A single emoji — matching how every other small icon in this app is
    # represented — rather than an uploaded image, since that's the simplest
    # fit for a small gamification badge.
    icon = models.CharField(max_length=8, blank=True)
    level = models.PositiveSmallIntegerField(unique=True)
    min_percent = models.PositiveSmallIntegerField()
    max_percent = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ['level']

    def __str__(self):
        return f'{self.name} ({self.min_percent}-{self.max_percent}%)'
