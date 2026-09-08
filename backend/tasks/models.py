from django.core.exceptions import ValidationError
from django.db import models

from academics.models import Topic
from accounts.models import StudentProfile
from common.models import TimeStampedModel
from common.storage import task_image_upload_to, task_submission_upload_to


class TaskKind(models.TextChoices):
    MARKDOWN = 'markdown', 'Markdown'
    IMAGE = 'image', 'Image'


class Task(TimeStampedModel):
    """A tutor-authored piece of optional practice work attached to a Topic
    — unrelated to Lesson.task_content/LessonType.WITH_TASK (that's the
    submission step of a *Lesson*, a completely different concept). A Task
    has no per-student assignment: every student in the subject's class sees
    every Task under it immediately, and just marks it done (TaskCompletion)
    whenever they like — no assignment, grading, or review workflow."""

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=255)
    kind = models.CharField(max_length=10, choices=TaskKind.choices)
    # Markdown body — set only when kind=MARKDOWN.
    content = models.TextField(blank=True)
    # Uploaded worksheet/drawing — set only when kind=IMAGE.
    image = models.FileField(upload_to=task_image_upload_to, blank=True)
    order_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['topic__order_index', 'order_index', 'id']

    def clean(self):
        if self.kind == TaskKind.MARKDOWN and not self.content:
            raise ValidationError('content is required for markdown tasks')
        if self.kind == TaskKind.IMAGE and not self.image:
            raise ValidationError('image is required for image tasks')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.title} — {self.topic}'


class TaskCompletion(models.Model):
    """One row per (student, Task) once the student has marked it done —
    existence is the done/not-done signal, mirroring
    lessons.models.TopicCompletionBonus. Deleted (not flagged) to un-mark,
    since a student can freely toggle a Task's done state."""

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='task_completions')
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='completions')
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('student', 'task')]

    def __str__(self):
        return f'{self.student} — {self.task}'


class TaskSubmission(models.Model):
    """A student's optional free-text answer and/or attached file for a
    Task — independent of TaskCompletion (a student can submit an answer
    without marking the task done, or vice versa). One row per (student,
    task); resubmitting overwrites it in place rather than keeping a
    history, since there's no tutor review/grading workflow here."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='submissions')
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='task_submissions')
    text = models.TextField(blank=True)
    file = models.FileField(upload_to=task_submission_upload_to, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('student', 'task')]

    def __str__(self):
        return f'{self.student} — {self.task}'
