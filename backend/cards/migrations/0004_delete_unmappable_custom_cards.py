# Split out from 0005's schema change into its own migration (own
# transaction) — Postgres refuses an ALTER TABLE right after a DELETE that
# leaves deferred FK trigger events pending on the same table within one
# transaction ("cannot ALTER TABLE ... because it has pending trigger
# events"). See 0005_studentcustomtopic_real_subject.py for why this data
# has nothing to backfill into and must be deleted rather than migrated.

from django.db import migrations


def delete_unmappable_custom_data(apps, schema_editor):
    StudentCard = apps.get_model('cards', 'StudentCard')
    StudentCustomLesson = apps.get_model('cards', 'StudentCustomLesson')
    StudentCustomTopic = apps.get_model('cards', 'StudentCustomTopic')
    StudentCustomSubject = apps.get_model('cards', 'StudentCustomSubject')

    StudentCard.objects.filter(custom_lesson__isnull=False).delete()
    StudentCustomLesson.objects.all().delete()
    StudentCustomTopic.objects.all().delete()
    StudentCustomSubject.objects.all().delete()


def noop_reverse(apps, schema_editor):
    # Nothing to reverse into — see module docstring.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('cards', '0003_studentcustomsubject_and_more'),
    ]

    operations = [
        migrations.RunPython(delete_unmappable_custom_data, noop_reverse),
    ]
