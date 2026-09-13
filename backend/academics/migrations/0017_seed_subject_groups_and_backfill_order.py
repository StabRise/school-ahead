from django.db import migrations

GROUP_NAMES = ['Українська школа', 'Польська школа']


def seed_groups_and_backfill_order(apps, schema_editor):
    SubjectGroup = apps.get_model('academics', 'SubjectGroup')
    Subject = apps.get_model('academics', 'Subject')

    for index, name in enumerate(GROUP_NAMES, start=1):
        SubjectGroup.objects.get_or_create(name=name, defaults={'order_index': index})

    class_ids = Subject.objects.order_by().values_list('school_class_id', flat=True).distinct()
    for class_id in class_ids:
        for index, subject in enumerate(Subject.objects.filter(school_class_id=class_id).order_by('name')):
            subject.order_index = index
            subject.save(update_fields=['order_index'])


def unseed_groups(apps, schema_editor):
    SubjectGroup = apps.get_model('academics', 'SubjectGroup')
    SubjectGroup.objects.filter(name__in=GROUP_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0016_subjectgroup_subject_attestation_type_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_groups_and_backfill_order, unseed_groups),
    ]
