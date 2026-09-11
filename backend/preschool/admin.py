from django.contrib import admin

from .models import Story, StoryAsset


class StoryAssetInline(admin.TabularInline):
    model = StoryAsset
    extra = 0


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'subtitle', 'created_by', 'updated_at')
    search_fields = ('title', 'subtitle')
    autocomplete_fields = ('created_by',)
    inlines = [StoryAssetInline]
