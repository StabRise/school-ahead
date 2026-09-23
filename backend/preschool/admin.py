from django.contrib import admin

from .models import BackgroundMusic, Game, GameCategory, Story, StoryAsset


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


class GameInline(admin.TabularInline):
    model = Game
    extra = 0
    fields = ('title', 'url', 'icon', 'is_active', 'order')


@admin.register(GameCategory)
class GameCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'order')
    list_editable = ('is_active', 'order')
    inlines = [GameInline]


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'url', 'is_active', 'order')
    list_editable = ('is_active', 'order')
    list_filter = ('category', 'is_active')
    search_fields = ('title', 'url')


@admin.register(BackgroundMusic)
class BackgroundMusicAdmin(admin.ModelAdmin):
    list_display = ('title', 'is_active', 'order', 'updated_at')
    list_editable = ('is_active', 'order')
    list_filter = ('is_active',)
    search_fields = ('title',)
