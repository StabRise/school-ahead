from django.db import migrations

from academics.colors import SUBJECT_COLOR_PALETTE


def backfill_colors(apps, schema_editor):
    Subject = apps.get_model('academics', 'Subject')
    class_ids = Subject.objects.order_by().values_list('school_class_id', flat=True).distinct()
    for class_id in class_ids:
        used = set()
        for index, subject in enumerate(Subject.objects.filter(school_class_id=class_id).order_by('id')):
            if subject.color:
                used.add(subject.color)
                continue
            next_color = next((c for c in SUBJECT_COLOR_PALETTE if c not in used), None)
            if next_color is None:
                next_color = SUBJECT_COLOR_PALETTE[index % len(SUBJECT_COLOR_PALETTE)]
            subject.color = next_color
            subject.save(update_fields=['color'])
            used.add(next_color)


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0009_subject_color'),
    ]

    operations = [
        migrations.RunPython(backfill_colors, migrations.RunPython.noop),
    ]
