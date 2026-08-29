# Adds outfit-themed clothing/headwear/accessory items to the existing
# "kitten" companion — see docs/core/avatar.md section 2.2.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (slot, key, display name, source file, layer_order — see docs/core/avatar.md
# layering scheme: base/mid layer 2, outerwear 3, headwear/accessory 0/1)
NEW_KITTEN_ITEMS = [
    ('clothing', 'vest', 'Жилет', 'kitten-clothing-vest.svg', 2),
    ('clothing', 'sweater', 'Светр', 'kitten-clothing-sweater.svg', 2),
    ('clothing', 'chef-coat', 'Кітель кухаря', 'kitten-clothing-chef-coat.svg', 3),
    ('headwear', 'chef-hat', 'Ковпак кухаря', 'kitten-headwear-chef-hat.svg', 0),
    ('accessory', 'bat-wings', 'Крила кажана', 'kitten-accessory-bat-wings.svg', 0),
    ('accessory', 'star-pendant', 'Кулон-зірка', 'kitten-accessory-star-pendant.svg', 1),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    kitten = Avatar.objects.filter(key='kitten').first()
    if kitten is None:
        return

    start_index = kitten.items.count()
    for offset, (slot, key, name, filename, layer_order) in enumerate(NEW_KITTEN_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(
            avatar=kitten,
            slot=slot,
            key=key,
            name=name,
            order_index=start_index + offset,
            layer_order=layer_order,
        )
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def remove_items(apps, schema_editor):
    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    AvatarItem.objects.filter(
        avatar__key='kitten', key__in=[key for _, key, *_ in NEW_KITTEN_ITEMS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0015_remove_studentprofile_equipped_accessory_and_more'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
