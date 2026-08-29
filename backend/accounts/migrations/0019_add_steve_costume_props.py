# Adds the held prop for each costume added in 0017/0018 (knight's sword,
# king's scepter, chef's whisk) as accessory-slot items — see
# docs/core/avatar.md section 2.2 ("Special Items"). The astronaut costume
# has no prop in the reference art.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (key, display name, source file, price)
STEVE_COSTUME_PROPS = [
    ('sword', 'Меч', 'steve-accessory-sword.svg', 5),
    ('scepter', 'Королівський скіпетр', 'steve-accessory-scepter.svg', 5),
    ('whisk', 'Віничок кухаря', 'steve-accessory-whisk.svg', 5),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    steve = Avatar.objects.filter(key='steve').first()
    if steve is None:
        return

    start_index = steve.items.count()
    for offset, (key, name, filename, price) in enumerate(STEVE_COSTUME_PROPS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(
            avatar=steve,
            slot='accessory',
            key=key,
            name=name,
            order_index=start_index + offset,
            price=price,
        )
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def remove_items(apps, schema_editor):
    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    AvatarItem.objects.filter(
        avatar__key='steve', key__in=[key for key, *_ in STEVE_COSTUME_PROPS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0018_add_steve_costume_headwear'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
