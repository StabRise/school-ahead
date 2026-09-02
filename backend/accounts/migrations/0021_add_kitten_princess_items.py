# Adds a "princess"-themed crown, apron, and pink dress to the existing
# "kitten" companion — see docs/core/avatar.md section 2.2 and
# 0016_add_kitten_wardrobe_items.py for the original wardrobe pass this
# extends. Free (price=0), same as every other kitten item so far.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (slot, key, display name, source file, layer_order — see docs/core/avatar.md
# layering scheme: headwear/accessory base layer 0/1, base clothing 2,
# outerwear 3. The apron ties on over whatever's equipped underneath, same
# as the chef-coat's layer_order=3; the dress is worn on its own, same as
# the vest/sweater's layer_order=2.)
NEW_KITTEN_ITEMS = [
    ('headwear', 'crown', 'Корона', 'kitten-headwear-crown.svg', 0),
    ('clothing', 'apron', 'Фартух', 'kitten-clothing-apron.svg', 3),
    ('clothing', 'pink-dress', 'Рожева сукня', 'kitten-clothing-pink-dress.svg', 2),
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
        ('accounts', '0020_studentprofile_completed_lessons_percent_cache'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
