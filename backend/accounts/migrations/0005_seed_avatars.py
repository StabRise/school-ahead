from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'lessons'

# (key, display name, source file in sample_media/lessons/) — reuses the
# character illustrations already in the repo rather than adding new
# binary assets. See docs/core/avatar.md.
AVATARS = [
    ('raccoon', 'Єнотик', 'raccoon.png'),
    ('fox', 'Лисеня', 'fox.png'),
    ('unicorn', 'Єдиноріг', 'unicorn.png'),
    ('owl', 'Сова', 'owl.png'),
    ('hedgehog', 'Їжачок', 'hedgehog.png'),
    ('rabbit', 'Зайчик', 'rabbit.png'),
]


def seed_avatars(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')

    for index, (key, name, filename) in enumerate(AVATARS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        avatar = Avatar(key=key, name=name, order_index=index)
        avatar.image.save(filename, ContentFile(source.read_bytes()), save=False)
        avatar.save()


def unseed_avatars(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    Avatar.objects.filter(key__in=[key for key, _, _ in AVATARS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_avatar_studentprofile_equipped_avatar'),
    ]

    operations = [
        migrations.RunPython(seed_avatars, unseed_avatars),
    ]
