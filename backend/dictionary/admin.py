from django.contrib import admin

from .models import DictionaryItem


@admin.register(DictionaryItem)
class DictionaryItemAdmin(admin.ModelAdmin):
    list_display = ('student', 'text', 'lang', 'translation', 'status', 'created_at')
    list_filter = ('lang', 'status')
    search_fields = ('text', 'translation', 'student__user__email')
    autocomplete_fields = ('student',)
