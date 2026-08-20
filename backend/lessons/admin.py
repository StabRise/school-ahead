from django.contrib import admin

from .models import (
    Lesson,
    LessonAttachment,
    LessonComment,
    LessonSubmission,
    QuizChoice,
    QuizQuestion,
    StudentLesson,
    StudentLessonStatusEvent,
)


class LessonAttachmentInline(admin.TabularInline):
    """Inline manager for files, videos, and links attached to a lesson template."""
    model = LessonAttachment
    extra = 1
    fields = ("kind", "title", "file", "url", "order_index")


class QuizChoiceInline(admin.TabularInline):
    """Inline manager for quiz choices associated with a quiz question."""
    model = QuizChoice
    extra = 2
    fields = ("text", "is_correct")


class QuizQuestionInline(admin.StackedInline):
    """Inline manager for quiz questions within a lesson, embedding their choices."""
    model = QuizQuestion
    extra = 1
    fields = ("order_index", "prompt")
    # Note: Nested inlines (QuizChoice inside QuizQuestionInline) require third-party packages
    # like django-nested-admin, so choices can be managed via their own admin view if needed.


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    """Admin configuration for static Lesson templates, including materials and structure."""
    list_display = (
        "title",
        "topic",
        "order_index",
        "lesson_type",
        "grading_type",
        "default_day_offset",
    )
    list_filter = ("lesson_type", "grading_type", "topic__subject__school_class", "topic")
    search_fields = ("title", "content", "topic__title", "topic__subject__name")
    ordering = ("topic", "order_index")
    inlines = [LessonAttachmentInline, QuizQuestionInline]


@admin.register(LessonAttachment)
class LessonAttachmentAdmin(admin.ModelAdmin):
    """Admin configuration for standalone lesson attachments."""
    list_display = ("title", "lesson", "kind", "order_index")
    list_filter = ("kind",)
    search_fields = ("title", "lesson__title")
    ordering = ("lesson", "order_index")


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    """Admin configuration for quiz questions with inline choice management."""
    list_display = ("prompt", "lesson", "order_index")
    search_fields = ("prompt", "lesson__title")
    inlines = [QuizChoiceInline]
    ordering = ("lesson", "order_index")


@admin.register(QuizChoice)
class QuizChoiceAdmin(admin.ModelAdmin):
    """Admin configuration for standalone quiz choices."""
    list_display = ("text", "question", "is_correct")
    list_filter = ("is_correct",)
    search_fields = ("text", "question__prompt")


class LessonSubmissionInline(admin.TabularInline):
    """Inline manager for student file submissions and comments within a StudentLesson."""
    model = LessonSubmission
    extra = 0
    readonly_fields = ("submitted_at",)
    fields = ("file", "comment", "is_latest", "submitted_at")


@admin.register(StudentLesson)
class StudentLessonAdmin(admin.ModelAdmin):
    """Admin configuration for dynamic per-student lesson instances, statuses, and grades."""
    list_display = (
        "student",
        "lesson",
        "status",
        "scheduled_date",
        "is_manually_scheduled",
        "grade_points",
        "grade_result",
        "attempt_count",
    )
    list_filter = (
        "status",
        "is_manually_scheduled",
        "grade_result",
        "scheduled_date",
    )
    search_fields = (
        "student__user__email",
        "student__user__first_name",
        "student__user__last_name",
        "lesson__title",
    )
    autocomplete_fields = ("student", "lesson", "subject_block")
    readonly_fields = ("started_at", "completed_at", "attempt_count")
    inlines = [LessonSubmissionInline]


@admin.register(LessonSubmission)
class LessonSubmissionAdmin(admin.ModelAdmin):
    """Admin configuration for student submissions across lessons."""
    list_display = ("student_lesson", "is_latest", "submitted_at")
    list_filter = ("is_latest", "submitted_at")
    search_fields = (
        "student_lesson__student__user__email",
        "student_lesson__lesson__title",
        "comment",
    )
    readonly_fields = ("submitted_at",)


@admin.register(LessonComment)
class LessonCommentAdmin(admin.ModelAdmin):
    """Admin configuration for the persistent per-lesson comment thread."""
    list_display = ("student_lesson", "author", "kind", "is_resolved", "created_at")
    list_filter = ("kind", "is_resolved", "created_at")
    search_fields = (
        "student_lesson__student__user__email",
        "student_lesson__lesson__title",
        "body",
    )
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)


@admin.register(StudentLessonStatusEvent)
class StudentLessonStatusEventAdmin(admin.ModelAdmin):
    """Admin configuration for tracking the audit trail of student lesson status changes."""
    list_display = ("student_lesson", "from_status", "to_status", "actor", "created_at")
    list_filter = ("from_status", "to_status", "created_at")
    search_fields = (
        "student_lesson__student__user__email",
        "student_lesson__lesson__title",
        "note",
    )
    readonly_fields = (
        "student_lesson",
        "from_status",
        "to_status",
        "actor",
        "note",
        "created_at",
    )
    ordering = ("-created_at",)