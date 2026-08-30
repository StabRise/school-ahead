# Adds the matching headwear for each costume added in 0017 (astronaut
# helmet, knight helmet, chef hat, king crown) — see docs/core/avatar.md
# section 2.2. Kept as separate headwear-slot items, same as the kitten
# chef-coat/chef-hat pairing in 0016, so a costume's headpiece can be
# toggled independently of its body.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (key, display name, source file, price)
STEVE_COSTUME_HEADWEAR = [
    ('astronaut-helmet', 'Шолом космонавта', 'steve-headwear-astronaut-helmet.svg', 5),
    ('knight-helmet', 'Лицарський шолом', 'steve-headwear-knight-helmet.svg', 5),
    ('chef-hat', 'Ковпак кухаря', 'steve-headwear-chef-hat.svg', 5),
    ('king-crown', 'Королівська корона', 'steve-headwear-king-crown.svg', 5),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    steve = Avatar.objects.filter(key='steve').first()
    if steve is None:
        return

    start_index = steve.items.count()
    for offset, (key, name, filename, price) in enumerate(STEVE_COSTUME_HEADWEAR):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(
            avatar=steve,
            slot='headwear',
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
        avatar__key='steve', key__in=[key for key, *_ in STEVE_COSTUME_HEADWEAR]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0017_add_steve_costume_items'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
