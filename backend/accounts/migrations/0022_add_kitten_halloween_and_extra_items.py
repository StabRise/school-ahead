# Adds a Halloween-themed set (witch hat, spooky charm collar, vampire
# cape) plus two unrelated extras (a hair bow, a kick scooter) to the
# existing "kitten" companion — see docs/core/avatar.md section 2.2 and
# 0021_add_kitten_princess_items.py for the prior wardrobe pass this
# extends. Free (price=0), same as most kitten items so far.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (slot, key, display name, source file, layer_order — see docs/core/avatar.md
# layering scheme: headwear/accessory base layer 0, neck-level accessory 1,
# base clothing 2, outerwear 3.)
NEW_KITTEN_ITEMS = [
    ('headwear', 'witch-hat', 'Капелюх відьми', 'kitten-headwear-witch-hat.svg', 0),
    ('accessory', 'spooky-collar', 'Хеловінський комірець', 'kitten-accessory-spooky-collar.svg', 1),
    ('clothing', 'vampire-cape', 'Плащ вампірчика', 'kitten-clothing-vampire-cape.svg', 3),
    ('accessory', 'bow', 'Бантик', 'kitten-accessory-bow.svg', 2),
    ('accessory', 'scooter', 'Самокат', 'kitten-accessory-scooter.svg', 0),
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
        ('accounts', '0021_add_kitten_princess_items'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
