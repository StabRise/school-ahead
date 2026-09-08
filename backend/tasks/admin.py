from django.contrib import admin

from .models import Task, TaskCompletion, TaskSubmission


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'topic', 'kind', 'order_index', 'created_at')
    list_filter = ('kind', 'topic__subject')
    search_fields = ('title', 'topic__title', 'topic__subject__name')
    list_select_related = ('topic', 'topic__subject')


@admin.register(TaskCompletion)
class TaskCompletionAdmin(admin.ModelAdmin):
    list_display = ('student', 'task', 'completed_at')
    list_select_related = ('student__user', 'task')


@admin.register(TaskSubmission)
class TaskSubmissionAdmin(admin.ModelAdmin):
    list_display = ('student', 'task', 'updated_at')
    list_select_related = ('student__user', 'task')
