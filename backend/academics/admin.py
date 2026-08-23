from django.contrib import admin

from .models import Class, School, Subject, SubjectBlock, Topic


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    """Admin configuration for School model."""
    list_display = ("name", "locale_default", "timezone", "created_at")
    search_fields = ("name",)


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    """Admin configuration for Class model."""
    list_display = ("name", "school", "academic_year", "order_index", "created_at")
    list_filter = ("school", "academic_year")
    search_fields = ("name", "academic_year")
    ordering = ("order_index",)


class SubjectBlockInline(admin.TabularInline):
    """Inline manager for subject blocks within the Subject admin view."""
    model = SubjectBlock
    extra = 1
    fields = ("index", "label", "status", "starts_on", "ends_on")


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
        "block_count",
        "start_date",
        "due_date",
        "created_at",
    )
    list_filter = ("school_class", "start_date")
    search_fields = ("name", "school_class__name", "description")
    ordering = ("school_class", "name")

    # Embed blocks and topics directly inside the subject detail view
    inlines = [SubjectBlockInline, TopicInline]


@admin.register(SubjectBlock)
class SubjectBlockAdmin(admin.ModelAdmin):
    """Admin configuration for standalone SubjectBlock management."""
    list_display = ("label", "subject", "index", "status", "starts_on", "ends_on")
    list_filter = ("status", "subject__school_class")
    search_fields = ("label", "subject__name")
    ordering = ("subject", "index")


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    """Admin configuration for standalone Topic management. subject_block is
    read-only here — it's auto-assigned by academics.services.
    assign_topics_to_blocks, not hand-edited."""
    list_display = ("title", "subject", "order_index", "subject_block", "created_at")
    list_filter = ("subject__school_class", "subject", "subject_block")
    search_fields = ("title", "description", "subject__name")
    ordering = ("subject", "order_index")
