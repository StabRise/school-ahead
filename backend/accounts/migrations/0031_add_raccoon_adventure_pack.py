# Adds an "adventurer" themed wardrobe pack (raincoat/flannel/tool-vest
# clothing, eye-patch/tool-belt/backpack accessories, caps/hats headwear,
# and a handful of found-object props) to the existing "raccoon" companion
# — see docs/core/avatar.md section 2.2. Priced 5-20 diamonds each,
# randomly assigned per item.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (slot, key, display name, source file, layer_order, price — see
# docs/core/avatar.md layering scheme: base clothing 1, mid layer 2,
# outerwear 3, carried items 4; headwear/accessory base layer 0,
# neck/waist-level accessory 1.)
NEW_RACCOON_ITEMS = [
    ('clothing', 'khaki-raincoat', 'Хакі дощовик з капюшоном', 'raccoon-clothing-khaki-raincoat.svg', 3, 8),
    ('clothing', 'flannel-shirt', 'Картата фланелева сорочка лісоруба', 'raccoon-clothing-flannel-shirt.svg', 2, 18),
    ('clothing', 'tool-vest', 'Жилет з кишенями для інструментів', 'raccoon-clothing-tool-vest.svg', 2, 7),
    ('clothing', 'ear-hoodie', 'Худі з прорізами для вух', 'raccoon-clothing-ear-hoodie.svg', 2, 6),
    ('clothing', 'denim-overalls-shorts', 'Потерті джинсові шорти на шлейках', 'raccoon-clothing-denim-overalls-shorts.svg', 1, 20),
    ('accessory', 'eye-patch', "Розбійницька пов'язка на око", 'raccoon-accessory-eye-patch.svg', 0, 6),
    ('accessory', 'tool-belt', 'Пояс з інструментами', 'raccoon-accessory-tool-belt.svg', 1, 9),
    ('accessory', 'hiking-backpack', 'Туристичний рюкзак зі значками', 'raccoon-accessory-hiking-backpack.svg', 4, 8),
    ('accessory', 'leather-bracelet', 'Шкіряний браслет на лапу', 'raccoon-accessory-leather-bracelet.svg', 1, 13),
    ('accessory', 'tail-band', "Пов'язка на хвіст з кільцями", 'raccoon-accessory-tail-band.svg', 0, 17),
    ('headwear', 'backwards-cap', 'Кепка козирком назад', 'raccoon-headwear-backwards-cap.svg', 0, 19),
    ('headwear', 'traveler-hat', 'Капелюх мандрівника з пером', 'raccoon-headwear-traveler-hat.svg', 0, 20),
    ('headwear', 'striped-beanie', "В'язана смугаста шапка", 'raccoon-headwear-striped-beanie.svg', 0, 8),
    ('headwear', 'hard-hat', 'Будівельна каска', 'raccoon-headwear-hard-hat.svg', 0, 12),
    ('accessory', 'shiny-can', 'Блискуча бляшанка', 'raccoon-accessory-shiny-can.svg', 0, 9),
    ('accessory', 'flashlight', 'Ліхтарик з променем, що блимає', 'raccoon-accessory-flashlight.svg', 0, 13),
    ('accessory', 'half-eaten-donut', 'Надкушений пончик', 'raccoon-accessory-half-eaten-donut.svg', 0, 10),
    ('accessory', 'wrench', 'Розвідний ключ', 'raccoon-accessory-wrench.svg', 0, 16),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    raccoon = Avatar.objects.filter(key='raccoon').first()
    if raccoon is None:
        return

    start_index = raccoon.items.count()
    for offset, (slot, key, name, filename, layer_order, price) in enumerate(NEW_RACCOON_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(
            avatar=raccoon,
            slot=slot,
            key=key,
            name=name,
            order_index=start_index + offset,
            layer_order=layer_order,
            price=price,
        )
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def remove_items(apps, schema_editor):
    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    AvatarItem.objects.filter(
        avatar__key='raccoon', key__in=[key for _, key, *_ in NEW_RACCOON_ITEMS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0030_add_steve_minecraft_pack'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
