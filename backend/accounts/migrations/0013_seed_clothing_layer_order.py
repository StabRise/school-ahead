# Backfills AvatarItem.layer_order on the already-seeded clothing pieces, per
# the layering scheme in docs/core/avatar.md: underwear/socks 0, base layer
# (t-shirt/pants) 1, mid layer (sweater/shoes) 2, outerwear (jacket/coat) 3,
# carried items (backpack/bag) 4.

from django.db import migrations

LAYER_ORDERS = {
    'sweater': 2,
    'hoodie': 2,
    'jacket': 3,
    'pants': 1,
    'shirt-red': 1,
    'shirt-green': 1,
    'shirt-yellow': 1,
    'shirt-purple': 1,
}


def seed_layer_order(apps, schema_editor):
    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    for key, layer_order in LAYER_ORDERS.items():
        AvatarItem.objects.filter(slot='clothing', key=key).update(layer_order=layer_order)


def unseed_layer_order(apps, schema_editor):
    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    AvatarItem.objects.filter(slot='clothing', key__in=LAYER_ORDERS.keys()).update(layer_order=0)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_remove_studentprofile_equipped_clothing_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_layer_order, unseed_layer_order),
    ]
