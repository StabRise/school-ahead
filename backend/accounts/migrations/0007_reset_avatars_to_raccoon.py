# Generated for the avatar customization revamp — see docs/core/avatar.md.

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import migrations

SAMPLE_AVATARS_DIR = settings.BASE_DIR / 'sample_media' / 'avatars'

# Deleting the old catalog rows below goes through StudentProfile.equipped_avatar's
# on_delete=SET_NULL (QuerySet.delete() still runs Django's on_delete handlers), so
# any student who had one of these equipped is left with equipped_avatar=None —
# same as a brand-new student who hasn't picked yet.
OLD_AVATAR_KEYS = ['raccoon', 'fox', 'unicorn', 'owl', 'hedgehog', 'rabbit']

RACCOON_ITEMS = [
    # (slot, key, display name, source file in sample_media/avatars/)
    ('clothing', 'sweater', 'Смугастий светр', 'raccoon-clothing-sweater.svg'),
    ('headwear', 'cap', 'Кепка', 'raccoon-headwear-cap.svg'),
    ('accessory', 'glasses', 'Окуляри', 'raccoon-accessory-glasses.svg'),
    ('accessory', 'book', 'Книжка', 'raccoon-accessory-book.svg'),
]


def reset_avatars(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    AvatarItem = apps.get_model('accounts', 'AvatarItem')

    Avatar.objects.filter(key__in=OLD_AVATAR_KEYS).delete()

    body_source = SAMPLE_AVATARS_DIR / 'raccoon-body.svg'
    if not body_source.is_file():
        return
    raccoon = Avatar(key='raccoon', name='Єнотик', order_index=0)
    raccoon.image.save(body_source.name, ContentFile(body_source.read_bytes()), save=False)
    raccoon.save()

    for index, (slot, key, name, filename) in enumerate(RACCOON_ITEMS):
        source = SAMPLE_AVATARS_DIR / filename
        if not source.is_file():
            continue
        item = AvatarItem(avatar=raccoon, slot=slot, key=key, name=name, order_index=index)
        item.image.save(filename, ContentFile(source.read_bytes()), save=False)
        item.save()


def unreset_avatars(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'Avatar')
    Avatar.objects.filter(key='raccoon').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_avataritem_studentprofile_equipped_accessory_and_more'),
    ]

    operations = [
        migrations.RunPython(reset_avatars, unreset_avatars),
    ]
