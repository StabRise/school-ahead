from django.contrib import admin

from .models import StudentCard, StudentCustomLesson, StudentCustomTopic


@admin.register(StudentCard)
class StudentCardAdmin(admin.ModelAdmin):
    list_display = ('student', 'lesson', 'custom_lesson', 'term', 'translation', 'created_at')
    list_filter = ('lesson__topic__subject',)
    search_fields = ('term', 'translation', 'student__user__email')
    autocomplete_fields = ('student', 'lesson', 'custom_lesson')


@admin.register(StudentCustomTopic)
class StudentCustomTopicAdmin(admin.ModelAdmin):
    list_display = ('title', 'subject', 'student')
    search_fields = ('title', 'subject__name', 'student__user__email')
    autocomplete_fields = ('subject', 'student')


@admin.register(StudentCustomLesson)
class StudentCustomLessonAdmin(admin.ModelAdmin):
    list_display = ('title', 'topic', 'order_index')
    search_fields = ('title', 'topic__title')
    autocomplete_fields = ('topic',)
