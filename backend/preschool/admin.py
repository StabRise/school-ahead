from django.contrib import admin

from .models import Story, StoryAsset


class StoryAssetInline(admin.TabularInline):
    model = StoryAsset
    extra = 0


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'slug', 'subtitle', 'is_published', 'created_by', 'updated_at')
    list_filter = ('is_published',)
    search_fields = ('title', 'subtitle', 'slug')
    autocomplete_fields = ('created_by',)
    readonly_fields = ('slug',)
    inlines = [StoryAssetInline]
