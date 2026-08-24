from academics.models import Subject
from django.contrib import admin

from .models import TutorSubjectAssignment


@admin.register(TutorSubjectAssignment)
class TutorSubjectAssignmentAdmin(admin.ModelAdmin):
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "subject":
            kwargs["queryset"] = Subject.objects.order_by("name")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
