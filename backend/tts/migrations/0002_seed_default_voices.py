from django.db import migrations

# Matches frontend/lib/piper-tts.ts's hardcoded SHORT_VOICE_BY_LANGUAGE /
# SENTENCE_VOICE_BY_LANGUAGE defaults at the time this table was introduced,
# so seeding it doesn't change any voice a language was already using.
DEFAULT_VOICES = (
    {'language': 'en', 'profile': 'short', 'voice_id': 'en_US-lessac-medium'},
    {'language': 'en', 'profile': 'sentence', 'voice_id': 'en_US-lessac-medium'},
    {'language': 'uk', 'profile': 'short', 'voice_id': 'uk_UA-mykyta-high'},
    {'language': 'uk', 'profile': 'sentence', 'voice_id': 'uk_UA-mykyta-high'},
    {'language': 'pl', 'profile': 'short', 'voice_id': 'pl_PL-gosia-medium'},
    {'language': 'pl', 'profile': 'sentence', 'voice_id': 'pl_PL-gosia-medium'},
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
        ('tts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_voices, remove_default_voices),
    ]
