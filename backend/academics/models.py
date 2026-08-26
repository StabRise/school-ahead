import datetime

from django.core.exceptions import ValidationError
from django.db import models

from common.models import TimeStampedModel
from common.storage import subject_icon_upload_to


class School(models.Model):
    name = models.CharField(max_length=255)
    locale_default = models.CharField(max_length=10, default='uk')
    timezone = models.CharField(max_length=64, default='Europe/Kyiv')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Class(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=50)
    order_index = models.PositiveSmallIntegerField()
    academic_year = models.CharField(max_length=9)
    # Класний керівник — always a TutorProfile (admins hold one too, see
    # decision 7), never a plain student/parent account. String reference
    # since accounts.StudentProfile.school_class already points the other
    # way at 'academics.Class'.
    class_teacher = models.ForeignKey(
        'accounts.TutorProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='homeroom_classes'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('school', 'name', 'academic_year')]
        ordering = ['order_index']

    def __str__(self):
        return f'{self.name} ({self.academic_year})'


class Subject(TimeStampedModel):
    school_class = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    recommended_resources = models.TextField(blank=True)
    block_count = models.PositiveSmallIntegerField(default=2)
    start_date = models.DateField()
    due_date = models.DateField()
    # Tutor-set flag: "this subject's curriculum is fully populated with
    # lessons" — purely informational (doesn't gate anything), toggled from
    # the tutor's Subject detail page.
    is_filled = models.BooleanField(default=False)
    # Fallback chain for the preschool game map's step-node icon: lesson
    # icon -> subject icon -> a frontend-side default. See
    # docs/interfaces/preschool.md.
    icon = models.FileField(upload_to=subject_icon_upload_to, blank=True)

    def clean(self):
        if self.start_date and self.due_date and self.start_date >= self.due_date:
            raise ValidationError('start_date must be strictly earlier than due_date')

    def save(self, *args, **kwargs):
        if not self.start_date:
            self.start_date = default_subject_start_date(self.school_class)
        if not self.due_date:
            self.due_date = default_subject_due_date(self.start_date)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.school_class.name})"


def default_subject_start_date(school_class: Class) -> datetime.date:
    """September 1 of the class's academic year, e.g. '2025/2026' -> 2025-09-01.
    See docs/core/schedule_planning.md."""
    year = int(school_class.academic_year.split('/')[0])
    return datetime.date(year, 9, 1)


def default_subject_due_date(start_date: datetime.date) -> datetime.date:
    """start_date + 9 months. See docs/core/schedule_planning.md."""
    month = start_date.month + 9
    year = start_date.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    return datetime.date(year, month, start_date.day)


class SubjectBlock(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        CLOSED = 'closed', 'Closed'

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='blocks')
    index = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('subject', 'index')]
        ordering = ['index']

    def save(self, *args, **kwargs):
        if not self.label:
            self.label = f'Semester {self.index}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.subject} — {self.label}'


class Topic(models.Model):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='topics')
    # Generated curriculum titles can run long, so this is wider than the
    # usual 255-char title field.
    title = models.CharField(max_length=512)
    description = models.TextField(blank=True)
    order_index = models.PositiveSmallIntegerField()
    # Auto-assigned by academics.services.assign_topics_to_blocks (even split
    # across the subject's blocks, in order_index order) — every Lesson under
    # a Topic inherits this same block, so block membership lives here rather
    # than per-StudentLesson. See docs/interfaces/student/subjects.md.
    subject_block = models.ForeignKey(
        SubjectBlock, on_delete=models.SET_NULL, null=True, blank=True, related_name='topics'
    )
    # Set when a tutor manually moves this topic to a different block
    # (tutoring.api.set_topic_block) — excludes it from the even-split
    # recompute in assign_topics_to_blocks so a later topic/block change
    # elsewhere in the subject doesn't silently undo the move.
    subject_block_manually_set = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order_index']

    def __str__(self):
        return f"{self.title} — {self.subject}"
