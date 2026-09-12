# Adds a big Minecraft-themed wardrobe pack (armor sets, headwear, tools and
# props) to the existing "steve" companion — see docs/core/avatar.md section
# 2.2. Priced 5-20 diamonds each, randomly assigned per item.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (slot, key, display name, source file, layer_order, price)
NEW_STEVE_ITEMS = [
    ('clothing', 'shirt-turquoise', 'Бірюзова футболка', 'steve-clothing-shirt-turquoise.svg', 1, 20),
    ('clothing', 'worn-blue-pants', 'Потерті сині штани', 'steve-clothing-worn-blue-pants.svg', 1, 9),
    ('clothing', 'leather-armor', 'Шкіряна броня', 'steve-clothing-leather-armor.svg', 3, 10),
    ('clothing', 'diamond-armor', 'Алмазна броня', 'steve-clothing-diamond-armor.svg', 3, 20),
    ('clothing', 'golden-armor', 'Золота броня', 'steve-clothing-golden-armor.svg', 3, 19),
    ('clothing', 'netherite-armor', 'Незеритова броня з лавовими візерунками', 'steve-clothing-netherite-armor.svg', 3, 19),
    ('clothing', 'cape', 'Плащ', 'steve-clothing-cape.svg', 3, 8),
    ('headwear', 'iron-helmet', 'Залізний шолом', 'steve-headwear-iron-helmet.svg', 0, 18),
    ('headwear', 'pumpkin-head', 'Гарбуз на голову', 'steve-headwear-pumpkin-head.svg', 0, 13),
    ('headwear', 'pixel-ushanka', 'Піксельна шапка-вушанка', 'steve-headwear-pixel-ushanka.svg', 0, 13),
    ('headwear', 'adventurer-headband', "Пов'язка шукача пригод", 'steve-headwear-adventurer-headband.svg', 0, 13),
    ('headwear', 'flower-wreath', 'Квітковий вінок з маків та кульбабок', 'steve-headwear-flower-wreath.svg', 0, 12),
    ('headwear', 'golden-crown', 'Золота корона', 'steve-headwear-golden-crown.svg', 0, 12),
    ('accessory', 'resource-satchel', 'Сумка для ресурсів', 'steve-accessory-resource-satchel.svg', 4, 18),
    ('accessory', 'potion-belt', 'Пояс із зіллям лікування', 'steve-accessory-potion-belt.svg', 1, 5),
    ('accessory', 'torch', 'Смолоскип', 'steve-accessory-torch.svg', 0, 11),
    ('accessory', 'totem-necklace', 'Тотем безсмертя на ланцюжку', 'steve-accessory-totem-necklace.svg', 1, 9),
    ('accessory', 'elytra', 'Елітри', 'steve-accessory-elytra.svg', 4, 6),
    ('accessory', 'wooden-pickaxe', "Дерев'яна кирка", 'steve-accessory-wooden-pickaxe.svg', 0, 11),
    ('accessory', 'diamond-pickaxe', 'Алмазна кирка', 'steve-accessory-diamond-pickaxe.svg', 0, 9),
    ('accessory', 'iron-sword', 'Гострий залізний меч', 'steve-accessory-iron-sword.svg', 0, 20),
    ('accessory', 'fishing-rod', "Дерев'яна вудка", 'steve-accessory-fishing-rod.svg', 0, 12),
    ('accessory', 'enchanted-book', 'Книга чар із сяючими сторінками', 'steve-accessory-enchanted-book.svg', 0, 19),
    ('accessory', 'invisibility-potion', 'Зілля невидимості у скляній колбі', 'steve-accessory-invisibility-potion.svg', 0, 17),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    steve = Avatar.objects.filter(key='steve').first()
    if steve is None:
        return

    start_index = steve.items.count()
    for offset, (slot, key, name, filename, layer_order, price) in enumerate(NEW_STEVE_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(
            avatar=steve,
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
        avatar__key='steve', key__in=[key for _, key, *_ in NEW_STEVE_ITEMS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0029_add_kitten_theme_pack'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
