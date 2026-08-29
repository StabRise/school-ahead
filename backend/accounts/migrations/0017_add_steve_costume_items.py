# Adds priced full-body costume clothing to Steve (astronaut/knight/chef/king)
# — see docs/core/avatar.md section 2.2. Each is an outerwear layer, same as
# the existing free jacket (layer_order 3), so it draws over the shirt/pants.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (key, display name, source file, price)
STEVE_COSTUME_ITEMS = [
    ('astronaut-suit', 'Костюм космонавта', 'steve-clothing-astronaut-suit.svg', 5),
    ('knight-armor', 'Лицарські обладунки', 'steve-clothing-knight-armor.svg', 5),
    ('chef-outfit', 'Костюм кухаря', 'steve-clothing-chef-outfit.svg', 5),
    ('king-robe', 'Королівська мантія', 'steve-clothing-king-robe.svg', 5),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    steve = Avatar.objects.filter(key='steve').first()
    if steve is None:
        return

    start_index = steve.items.count()
    for offset, (key, name, filename, price) in enumerate(STEVE_COSTUME_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(
            avatar=steve,
            slot='clothing',
            key=key,
            name=name,
            order_index=start_index + offset,
            layer_order=3,
            price=price,
        )
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def remove_items(apps, schema_editor):
    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    AvatarItem.objects.filter(
        avatar__key='steve', key__in=[key for key, *_ in STEVE_COSTUME_ITEMS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0016_add_kitten_wardrobe_items'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
