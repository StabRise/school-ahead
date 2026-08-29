from django.contrib import admin

from .models import TtsVoiceSetting


@admin.register(TtsVoiceSetting)
class TtsVoiceSettingAdmin(admin.ModelAdmin):
    list_display = ('language', 'profile', 'voice_id')
    list_filter = ('language', 'profile')
    ordering = ('language', 'profile')

    # Adds a "Test voice" button next to the voice_id field on the change
    # form — see static/tts/admin/test_voice.js for why this has to be a
    # plain JS/CSS asset rather than a Python-side widget (synthesis is
    # WASM/browser-only).
    class Media:
        js = ('tts/admin/test_voice.js',)
        css = {'all': ('tts/admin/test_voice.css',)}
