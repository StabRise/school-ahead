import re

from django.db import migrations

# Frozen copy of services.normalize_asset_refs — rewrites the raw storage
# URLs the editor used to embed (presigned S3 links that expire after an
# hour) into the stable `/api/story-asset/<name>` ref.
_ASSET_URL_CARD_RE = re.compile(r'\{\s*[^\s{}]*/story_assets/([0-9a-f]{32}\.[A-Za-z0-9]{1,5})(?:\?[^\s{}]*)?\s*\}')


def forwards(apps, schema_editor):
    Story = apps.get_model('preschool', 'Story')
    for story in Story.objects.all():
        content = _ASSET_URL_CARD_RE.sub(lambda match: f'{{ /api/story-asset/{match.group(1)} }}', story.content)
        if content != story.content:
            story.content = content
            story.save(update_fields=['content'])


class Migration(migrations.Migration):
    dependencies = [
        ('preschool', '0006_alter_story_slug'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
