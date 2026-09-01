from common.storage import random_sample_lesson_icon
from django.contrib import admin
from django.core.files.base import ContentFile

from .models import (
    Lesson,
    LessonAttachment,
    LessonComment,
    LessonsJson,
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
    fields = ("text", "image", "is_correct")


class QuizQuestionInline(admin.StackedInline):
    """Inline manager for quiz questions within a lesson, embedding their choices."""
    model = QuizQuestion
    extra = 1
    fields = ("order_index", "prompt", "language")
    # Note: Nested inlines (QuizChoice inside QuizQuestionInline) require third-party packages
    # like django-nested-admin, so choices can be managed via their own admin view if needed.


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    """Admin configuration for static Lesson templates, including materials and structure."""
    list_display = (
        "title",
        # "topic",
        "subject",
        "lesson_type",
        "grading_type",
        "order_index",
        "default_day_offset",
        "created_at",
    )
    list_filter = (
        "lesson_type",
        "grading_type",
        ("topic__subject__school_class", admin.RelatedOnlyFieldListFilter),
        ("topic__subject", admin.RelatedOnlyFieldListFilter),
        ("topic", admin.RelatedOnlyFieldListFilter),
        # default_day_offset is only set for lessons pinned to a fixed day
        # of the plan rather than evenly scheduled — worth isolating.
        ("default_day_offset", admin.EmptyFieldListFilter),
    )
    search_fields = ("title", "content", "task_content", "topic__title", "topic__subject__name")
    ordering = ("topic", "order_index")
    list_select_related = ("topic", "topic__subject", "topic__subject__school_class")
    inlines = [LessonAttachmentInline, QuizQuestionInline]

    @admin.display(description="Subject", ordering="topic__subject")
    def subject(self, obj):
        return obj.topic.subject

    def save_model(self, request, obj, form, change):
        # A brand-new lesson with no icon set gets a random one from
        # sample_media/lessons/ instead of shipping with none — see
        # docs/interfaces/preschool.md.
        if not change and not obj.icon:
            sample = random_sample_lesson_icon()
            if sample:
                name, content = sample
                obj.icon.save(name, ContentFile(content), save=False)
        super().save_model(request, obj, form, change)


@admin.register(LessonAttachment)
class LessonAttachmentAdmin(admin.ModelAdmin):
    """Admin configuration for standalone lesson attachments."""
    list_display = ("title", "lesson", "kind", "order_index")
    list_filter = (
        "kind",
        ("lesson__topic__subject", admin.RelatedOnlyFieldListFilter),
        ("file", admin.EmptyFieldListFilter),
        ("url", admin.EmptyFieldListFilter),
    )
    search_fields = ("title", "lesson__title", "url")
    ordering = ("lesson", "order_index")
    list_select_related = ("lesson",)


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    """Admin configuration for quiz questions with inline choice management."""
    list_display = ("prompt", "lesson", "order_index", "language")
    list_filter = ("language", ("lesson__topic__subject", admin.RelatedOnlyFieldListFilter))
    search_fields = ("prompt", "lesson__title")
    inlines = [QuizChoiceInline]
    ordering = ("lesson", "order_index")
    list_select_related = ("lesson",)


@admin.register(QuizChoice)
class QuizChoiceAdmin(admin.ModelAdmin):
    """Admin configuration for standalone quiz choices."""
    list_display = ("text", "question", "is_correct")
    list_filter = ("is_correct", ("image", admin.EmptyFieldListFilter))
    search_fields = ("text", "question__prompt")
    list_select_related = ("question",)


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
        # RelatedOnlyFieldListFilter narrows each dropdown to students/
        # subjects/classes that actually appear on a StudentLesson, instead
        # of every StudentProfile/Subject/Class in the system.
        ("student", admin.RelatedOnlyFieldListFilter),
        ("lesson__topic__subject", admin.RelatedOnlyFieldListFilter),
        ("lesson__topic__subject__school_class", admin.RelatedOnlyFieldListFilter),
    )
    search_fields = (
        "student__user__email",
        "student__user__first_name",
        "student__user__last_name",
        "lesson__title",
    )
    autocomplete_fields = ("student", "lesson")
    readonly_fields = ("started_at", "completed_at", "attempt_count")
    list_select_related = ("student__user", "lesson__topic__subject")
    date_hierarchy = "scheduled_date"
    inlines = [LessonSubmissionInline]


@admin.register(LessonSubmission)
class LessonSubmissionAdmin(admin.ModelAdmin):
    """Admin configuration for student submissions across lessons."""
    list_display = ("student_lesson", "is_latest", "submitted_at", "feedback_at")
    list_filter = (
        "is_latest",
        "submitted_at",
        # Submissions the tutor hasn't replied to yet, at a glance.
        ("tutor_feedback", admin.EmptyFieldListFilter),
    )
    search_fields = (
        "student_lesson__student__user__email",
        "student_lesson__lesson__title",
        "comment",
    )
    readonly_fields = ("submitted_at",)
    list_select_related = ("student_lesson__student__user", "student_lesson__lesson")


@admin.register(LessonComment)
class LessonCommentAdmin(admin.ModelAdmin):
    """Admin configuration for the persistent per-lesson comment thread."""
    list_display = ("student_lesson", "author", "kind", "is_resolved", "created_at")
    list_filter = (
        "kind",
        "is_resolved",
        "created_at",
        ("author", admin.RelatedOnlyFieldListFilter),
        # Top-level comments (reply_to is null) vs replies in a thread.
        ("reply_to", admin.EmptyFieldListFilter),
    )
    search_fields = (
        "student_lesson__student__user__email",
        "student_lesson__lesson__title",
        "body",
    )
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)
    list_select_related = ("student_lesson__student__user", "author")


@admin.register(LessonsJson)
class LessonsJsonAdmin(admin.ModelAdmin):
    """Admin configuration for staged scrape_lessons JSON uploads awaiting import_lessons."""
    list_display = ("name", "subject", "status", "created_at", "updated_at")
    list_filter = (
        "status",
        ("subject__school_class", admin.RelatedOnlyFieldListFilter),
        ("subject", admin.RelatedOnlyFieldListFilter),
    )
    search_fields = ("name", "description", "subject__name")
    autocomplete_fields = ("subject", "lessons")
    readonly_fields = ("created_at", "updated_at")
    list_select_related = ("subject", "subject__school_class")


@admin.register(StudentLessonStatusEvent)
class StudentLessonStatusEventAdmin(admin.ModelAdmin):
    """Admin configuration for tracking the audit trail of student lesson status changes."""
    list_display = ("student_lesson", "from_status", "to_status", "actor", "created_at")
    list_filter = (
        "from_status",
        "to_status",
        "created_at",
        ("actor", admin.RelatedOnlyFieldListFilter),
        ("student_lesson__lesson__topic__subject__school_class", admin.RelatedOnlyFieldListFilter),
    )
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
    list_select_related = ("student_lesson__student__user", "student_lesson__lesson", "actor")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
