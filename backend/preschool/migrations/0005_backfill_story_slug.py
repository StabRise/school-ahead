from django.db import migrations

from preschool.slugs import slugify_title


def backfill_slugs(apps, schema_editor):
    Story = apps.get_model('preschool', 'story')
    used: set[str] = set()
    for story in Story.objects.order_by('id'):
        base = slugify_title(story.title) or 'story'
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f'{base}-{suffix}'
            suffix += 1
        used.add(candidate)
        story.slug = candidate
        story.save(update_fields=['slug'])


class Migration(migrations.Migration):

    dependencies = [
        ('preschool', '0004_story_slug'),
    ]

    operations = [
        migrations.RunPython(backfill_slugs, migrations.RunPython.noop),
    ]
