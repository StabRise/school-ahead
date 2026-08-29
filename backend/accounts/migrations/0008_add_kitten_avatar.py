# Adds the "kitten" companion alongside the existing raccoon — see docs/core/avatar.md.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

KITTEN_ITEMS = [
    # (slot, key, display name, source file in sample_media/avatars/)
    ('clothing', 'hoodie', 'Худі', 'kitten-clothing-hoodie.svg'),
    ('headwear', 'beanie', 'Шапка', 'kitten-headwear-beanie.svg'),
    ('accessory', 'sunglasses', 'Окуляри', 'kitten-accessory-sunglasses.svg'),
    ('accessory', 'headphones', 'Навушники', 'kitten-accessory-headphones.svg'),
]


def add_kitten(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    body_source = SAMPLE_AVATARS_DIR / 'kitten-body.svg'
    if not body_source.is_file():
        return
    kitten = Avatar(key='kitten', name='Кошеня', order_index=1)
    kitten.image.save(body_source.name, ContentFile(body_source.read_bytes()), save=False)
    kitten.save()

    for index, (slot, key, name, filename) in enumerate(KITTEN_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(avatar=kitten, slot=slot, key=key, name=name, order_index=index)
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def remove_kitten(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    Avatar.objects.filter(key='kitten').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_reset_avatars_to_raccoon'),
    ]

    operations = [
        migrations.RunPython(add_kitten, remove_kitten),
    ]
