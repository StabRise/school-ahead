from django.contrib import admin

from . import services
from .models import Class, Plan, School, Subject, SubjectBlock, Topic


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    """Admin configuration for School model."""
    list_display = ("name", "locale_default", "timezone", "created_at")
    list_filter = ("locale_default", "timezone")
    search_fields = ("name",)
    date_hierarchy = "created_at"


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    """Admin configuration for Class model."""
    list_display = ("name", "school", "academic_year", "order_index", "class_teacher", "created_at")
    list_filter = (
        "school",
        "academic_year",
        # A class with no homeroom teacher yet can't have a tutor upload a
        # plan for it (tutoring.services.ensure_is_class_teacher) — this
        # surfaces those at a glance instead of clicking through each one.
        ("class_teacher", admin.EmptyFieldListFilter),
    )
    search_fields = ("name", "academic_year", "school__name")
    ordering = ("order_index",)
    autocomplete_fields = ("class_teacher",)
    list_select_related = ("school", "class_teacher__user")


class SubjectBlockInline(admin.TabularInline):
    """Inline manager for subject blocks within the Subject admin view."""
    model = SubjectBlock
    extra = 1
    fields = ("index", "label", "description", "status", "starts_on", "ends_on", "weeks_count", "workload")
    readonly_fields = ("weeks_count", "workload")


class TopicInline(admin.TabularInline):
    """Inline manager for curriculum topics within the Subject admin view."""
    model = Topic
    extra = 1
    fields = ("order_index", "title", "description")


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    """Admin configuration for Subject model with integrated blocks and topics inlines."""
    list_display = (
        "name",
        "school_class",
        "created_at",
        "is_filled",
        "block_count",
        "start_date",
        "due_date",
        "color",

    )
    list_filter = (
        ("school_class__school", admin.RelatedOnlyFieldListFilter),
        "school_class",
        "is_filled",
        "start_date",
        # Blank only for subjects created before the color field existed
        # and not yet backfilled (see migration 0010) — this surfaces any
        # stragglers instantly instead of scanning every row for a blank cell.
        ("color", admin.EmptyFieldListFilter),
    )
    search_fields = ("name", "school_class__name", "description")
    ordering = ("school_class", "name")
    list_select_related = ("school_class", "school_class__school")
    date_hierarchy = "start_date"

    # Embed blocks and topics directly inside the subject detail view
    inlines = [SubjectBlockInline, TopicInline]

    def get_queryset(self, request):
        # Alphabetical by name — used by the autocomplete widget other
        # admins' `subject` fields render with (e.g. LessonsJsonAdmin), which
        # queries this instead of going through a select dropdown. The
        # changelist above still shows this list's own (school_class, name)
        # order since ChangeList re-applies `ordering` on top of whatever
        # this returns.
        return super().get_queryset(request).order_by("name")

    def save_formset(self, request, form, formset, change):
        super().save_formset(request, form, formset, change)
        if formset.model is SubjectBlock:
            # starts_on/ends_on edited here don't go through
            # academics.services.recompute_block_workload on their own.
            for block in formset.queryset:
                services.recompute_block_workload(block)


@admin.register(SubjectBlock)
class SubjectBlockAdmin(admin.ModelAdmin):
    """Admin configuration for standalone SubjectBlock management."""
    list_display = (
        "label",
        "subject",
        "index",
        "status",
        "starts_on",
        "ends_on",
        "weeks_count",
        "workload",
        "closed_at",
    )
    list_filter = (
        "status",
        "subject",
        ("subject__school_class__school", admin.RelatedOnlyFieldListFilter),
        "subject__school_class",
        # weeks_count/workload are null until both starts_on/ends_on are set
        # (academics.services.recompute_block_workload) — this finds blocks
        # still missing dates without opening each one.
        ("weeks_count", admin.EmptyFieldListFilter),
        ("closed_at", admin.EmptyFieldListFilter),
    )
    search_fields = ("label", "subject__name", "description")
    ordering = ("subject", "index")
    readonly_fields = ("weeks_count", "workload")
    list_select_related = ("subject", "subject__school_class")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # starts_on/ends_on edited here don't go through
        # academics.services.recompute_block_workload on their own.
        services.recompute_block_workload(obj)


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    """Admin configuration for standalone Topic management. subject_block is
    read-only here — it's auto-assigned by academics.services.
    assign_topics_to_blocks, not hand-edited."""
    list_display = ("title", "subject", "created_at", "order_index", "subject_block", "subject_block_manually_set", )
    list_filter = (
        ("subject__school_class", admin.RelatedOnlyFieldListFilter),
        ("subject", admin.RelatedOnlyFieldListFilter),
        ("subject_block", admin.RelatedOnlyFieldListFilter),
        "subject_block_manually_set",
        # subject_block is null right after a block-count shrink, before the
        # next assign_topics_to_blocks recompute self-heals it — worth
        # spotting directly.
        ("subject_block", admin.EmptyFieldListFilter),
    )
    search_fields = ("title", "description", "subject__name")
    ordering = ("subject", "order_index")
    list_select_related = ("subject", "subject_block")


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    """Admin configuration for curriculum-plan uploads — read-only history
    of what the tutor's "Завантажити план" wizard imported (see
    academics.services.import_class_plan); not meant to be hand-edited."""
    list_display = ("school_class", "semester_name", "created_at", "updated_at")
    list_filter = (
        ("school_class__school", admin.RelatedOnlyFieldListFilter),
        "school_class",
        "semester_name",
    )
    search_fields = ("semester_name", "school_class__name", "text")
    ordering = ("-created_at",)
    list_select_related = ("school_class", "school_class__school")
    date_hierarchy = "created_at"
    readonly_fields = ("school_class", "semester_name", "text", "created_at", "updated_at")
