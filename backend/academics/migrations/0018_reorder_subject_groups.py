from django.db import migrations

# Polish school listed before Ukrainian school (was the reverse in 0017).
ORDER = {
    'Польська школа': 1,
    'Українська школа': 2,
}


def reorder_groups(apps, schema_editor):
    SubjectGroup = apps.get_model('academics', 'SubjectGroup')
    for name, order_index in ORDER.items():
        SubjectGroup.objects.filter(name=name).update(order_index=order_index)


def unreorder_groups(apps, schema_editor):
    SubjectGroup = apps.get_model('academics', 'SubjectGroup')
    reverse_order = {'Польська школа': 2, 'Українська школа': 1}
    for name, order_index in reverse_order.items():
        SubjectGroup.objects.filter(name=name).update(order_index=order_index)


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0017_seed_subject_groups_and_backfill_order'),
    ]

    operations = [
        migrations.RunPython(reorder_groups, unreorder_groups),
    ]
