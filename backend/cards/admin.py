from django.contrib import admin

from .models import StudentCard


@admin.register(StudentCard)
class StudentCardAdmin(admin.ModelAdmin):
    list_display = ('student', 'lesson', 'term', 'translation', 'created_at')
    list_filter = ('lesson__topic__subject',)
    search_fields = ('term', 'translation', 'student__user__email')
    autocomplete_fields = ('student', 'lesson')
