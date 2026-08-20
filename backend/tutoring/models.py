from django.db import models

from academics.models import Subject
from accounts.models import TutorProfile


class TutorSubjectAssignment(models.Model):
    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='assignments')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='tutor_assignments')
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [('tutor', 'subject')]

    def __str__(self):
        return f'{self.tutor} -> {self.subject}'
