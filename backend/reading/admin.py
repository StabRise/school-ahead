from django.contrib import admin

from .models import Syllable


@admin.register(Syllable)
class SyllableAdmin(admin.ModelAdmin):
    list_display = (
        'first_letter', 'second_part', 'word', 'is_default', 'language', 'icon', 'syllable_audio', 'word_audio',
    )
    list_filter = ('language', 'first_letter', 'is_default')
    search_fields = ('first_letter', 'second_part', 'word')
    ordering = ('language', 'first_letter', 'second_part')
