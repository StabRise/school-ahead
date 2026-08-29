# Fixes the beanie/sunglasses/emerald placement on Steve (they were positioned
# against wrongly-estimated eye/head coordinates in 0009) and adds a watch
# accessory plus alternate pants and 4 t-shirt colors — see docs/core/avatar.md.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

STEVE_ITEMS = [
    # (slot, key, display name, source file in sample_media/avatars/)
    ('clothing', 'jacket', 'Куртка', 'steve-clothing-jacket.svg'),
    ('clothing', 'pants', 'Штани', 'steve-clothing-pants.svg'),
    ('clothing', 'shirt-red', 'Червона футболка', 'steve-clothing-shirt-red.svg'),
    ('clothing', 'shirt-green', 'Зелена футболка', 'steve-clothing-shirt-green.svg'),
    ('clothing', 'shirt-yellow', 'Жовта футболка', 'steve-clothing-shirt-yellow.svg'),
    ('clothing', 'shirt-purple', 'Фіолетова футболка', 'steve-clothing-shirt-purple.svg'),
    ('headwear', 'beanie', 'Шапка', 'steve-headwear-beanie.svg'),
    ('accessory', 'sunglasses', 'Окуляри', 'steve-accessory-sunglasses.svg'),
    ('accessory', 'emerald', 'Смарагд', 'steve-accessory-emerald.svg'),
    ('accessory', 'watch', 'Годинник', 'steve-accessory-watch.svg'),
]


def reset_steve(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    Avatar.objects.filter(key='steve').delete()

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


def unreset_steve(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    Avatar.objects.filter(key='steve').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_add_steve_avatar'),
    ]

    operations = [
        migrations.RunPython(reset_steve, unreset_steve),
    ]
