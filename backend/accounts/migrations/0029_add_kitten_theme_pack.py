# Adds a big theme pack to the "kitten" companion — costumes (rain-duck
# raincoat, superhero suit, pajama-with-ears, astronaut suit, polka-dot
# dress, deer sweater, tee+shorts set), hats/hair pieces (daisy panama,
# foil party crown, bunny-ear headband, butterfly clips, pompom hair ties),
# and held items (teddy bear, candy cane, skateboard, magic wand, crayon
# box, balloon, carrot backpack, chunky scarf, cat-ear headphones,
# heart-shaped sunglasses, polka-dot bow) — see docs/core/avatar.md
# section 2.2 and 0022_add_kitten_halloween_and_extra_items.py for the
# prior wardrobe pass this extends. Priced 5-20 diamonds each, randomly
# assigned per item.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# (slot, key, display name, source file, layer_order — see docs/core/avatar.md
# layering scheme: headwear/most accessories base layer 0, neck-level
# accessory 1, hair overlay accessory 2, base clothing 1/2, outerwear 3,
# carried items 4 — plus price, randomly assigned in the 5-20 diamond range.)
NEW_KITTEN_ITEMS = [
    ('clothing', 'rain-coat-duck', 'Дощовик з каченятами', 'kitten-clothing-rain-coat-duck.svg', 3, 14),
    ('clothing', 'superhero-suit', 'Костюм супергероя', 'kitten-clothing-superhero-suit.svg', 3, 7),
    ('clothing', 'pajama-ears', 'Піжама з вушками', 'kitten-clothing-pajama-ears.svg', 2, 18),
    ('clothing', 'astronaut-suit', 'Костюм космонавта', 'kitten-clothing-astronaut-suit.svg', 3, 13),
    ('clothing', 'polka-dot-dress', 'Сукня в горошок з бантиком', 'kitten-clothing-polka-dot-dress.svg', 2, 13),
    ('clothing', 'deer-sweater', 'Светр з оленями', 'kitten-clothing-deer-sweater.svg', 2, 12),
    ('clothing', 'shorts-tshirt-set', 'Шорти з кишенями та футболка', 'kitten-clothing-shorts-tshirt-set.svg', 1, 19),
    ('headwear', 'daisy-panama', 'Панама з ромашками', 'kitten-headwear-daisy-panama.svg', 0, 10),
    ('headwear', 'foil-crown', 'Корона з фольги', 'kitten-headwear-foil-crown.svg', 0, 18),
    ('headwear', 'bunny-ears-headband', 'Обідок із заячими вушками', 'kitten-headwear-bunny-ears-headband.svg', 0, 18),
    ('accessory', 'heart-sunglasses', 'Окуляри-сердечка', 'kitten-accessory-heart-sunglasses.svg', 0, 9),
    ('accessory', 'carrot-backpack', 'Рюкзак-морквина', 'kitten-accessory-carrot-backpack.svg', 4, 13),
    ('accessory', 'chunky-scarf', "Шарф грубої в'язки", 'kitten-accessory-chunky-scarf.svg', 1, 19),
    ('accessory', 'cat-ear-headphones', 'Навушники з котячими вушками', 'kitten-accessory-cat-ear-headphones.svg', 0, 9),
    ('accessory', 'teddy-bear', 'Плюшевий ведмедик', 'kitten-accessory-teddy-bear.svg', 0, 16),
    ('accessory', 'candy-cane', 'Велика льодяникова тростина', 'kitten-accessory-candy-cane.svg', 0, 19),
    ('accessory', 'skateboard', 'Блискучий скейтборд', 'kitten-accessory-skateboard.svg', 0, 9),
    ('accessory', 'magic-wand', 'Чарівна паличка із зірочкою', 'kitten-accessory-magic-wand.svg', 0, 6),
    ('accessory', 'crayon-box', 'Коробка кольорових олівців', 'kitten-accessory-crayon-box.svg', 0, 9),
    ('accessory', 'balloon', 'Повітряна кулька', 'kitten-accessory-balloon.svg', 0, 9),
    ('accessory', 'butterfly-clips', 'Заколки-метелики з блискітками', 'kitten-accessory-butterfly-clips.svg', 2, 6),
    ('accessory', 'pompom-hair-ties', 'Гумки для волосся з помпонами', 'kitten-accessory-pompom-hair-ties.svg', 2, 10),
    ('accessory', 'polka-dot-bow', 'Бант у великий горошок', 'kitten-accessory-polka-dot-bow.svg', 2, 8),
]


def add_items(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    kitten = Avatar.objects.filter(key='kitten').first()
    if kitten is None:
        return

    start_index = kitten.items.count()
    for offset, (slot, key, name, filename, layer_order, price) in enumerate(NEW_KITTEN_ITEMS):
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
            price=price,
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
        ('accounts', '0028_equippeditemplacement_scale'),
    ]

    operations = [
        migrations.RunPython(add_items, remove_items),
    ]
