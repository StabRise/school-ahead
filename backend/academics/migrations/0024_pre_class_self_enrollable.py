from django.db import migrations


def forwards(apps, schema_editor):
    # "Pre" — the preschool class new students are invited to join.
    apps.get_model('academics', 'Class').objects.filter(name__iexact='Pre').update(is_self_enrollable=True)


class Migration(migrations.Migration):
    dependencies = [
        ('academics', '0023_class_is_self_enrollable'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
