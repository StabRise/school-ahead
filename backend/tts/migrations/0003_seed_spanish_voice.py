from django.db import migrations

# Matches piper-tts.ts's SHORT_VOICE_BY_LANGUAGE / SENTENCE_VOICE_BY_LANGUAGE
# 'es' default added alongside this migration — see 0002_seed_default_voices.py.
DEFAULT_VOICES = (
    {'language': 'es', 'profile': 'short', 'voice_id': 'es_ES-davefx-medium'},
    {'language': 'es', 'profile': 'sentence', 'voice_id': 'es_ES-davefx-medium'},
)


def seed_voices(apps, schema_editor):
    TtsVoiceSetting = apps.get_model('tts', 'TtsVoiceSetting')
    for voice in DEFAULT_VOICES:
        TtsVoiceSetting.objects.update_or_create(
            language=voice['language'], profile=voice['profile'], defaults=voice
        )


def remove_default_voices(apps, schema_editor):
    TtsVoiceSetting = apps.get_model('tts', 'TtsVoiceSetting')
    for voice in DEFAULT_VOICES:
        TtsVoiceSetting.objects.filter(language=voice['language'], profile=voice['profile']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('tts', '0002_seed_default_voices'),
    ]

    operations = [
        migrations.RunPython(seed_voices, remove_default_voices),
    ]
