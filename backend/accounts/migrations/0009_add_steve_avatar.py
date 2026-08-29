# Adds the "steve" companion (Minecraft-inspired) alongside raccoon and kitten
# — see docs/core/avatar.md.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

STEVE_ITEMS = [
    # (slot, key, display name, source file in sample_media/avatars/)
    ('clothing', 'jacket', 'Куртка', 'steve-clothing-jacket.svg'),
    ('headwear', 'beanie', 'Шапка', 'steve-headwear-beanie.svg'),
    ('accessory', 'sunglasses', 'Окуляри', 'steve-accessory-sunglasses.svg'),
    ('accessory', 'emerald', 'Смарагд', 'steve-accessory-emerald.svg'),
]


def add_steve(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    body_source = SAMPLE_AVATARS_DIR / 'steve-body.svg'
    if not body_source.is_file():
        return
    steve = Avatar(key='steve', name='Стів', order_index=2)
    steve.image.save(body_source.name, ContentFile(body_source.read_bytes()), save=False)
    steve.save()

    for index, (slot, key, name, filename) in enumerate(STEVE_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(avatar=steve, slot=slot, key=key, name=name, order_index=index)
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def remove_steve(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    Avatar.objects.filter(key='steve').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_add_kitten_avatar'),
    ]

    operations = [
        migrations.RunPython(add_steve, remove_steve),
    ]
