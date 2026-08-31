import datetime

from django.db import migrations

# Fixed 2026/2027 academic-year dates for the two existing semester labels —
# see SubjectBlock.save()'s 'Semester {index}' default label.
SEMESTER_DATES = {
    'Semester 1': (datetime.date(2026, 9, 1), datetime.date(2026, 11, 30)),
    'Semester 2': (datetime.date(2027, 1, 1), datetime.date(2027, 4, 30)),
}


def backfill_block_dates_and_workload(apps, schema_editor):
    SubjectBlock = apps.get_model('academics', 'SubjectBlock')
    Lesson = apps.get_model('lessons', 'Lesson')

    for block in SubjectBlock.objects.all():
        dates = SEMESTER_DATES.get(block.label)
        if dates is not None:
            block.starts_on, block.ends_on = dates

        if block.starts_on and block.ends_on:
            block.weeks_count = (block.ends_on - block.starts_on).days // 7 - 2
        else:
            block.weeks_count = None

        lesson_count = Lesson.objects.filter(topic__subject_block=block).count()
        block.workload = lesson_count / block.weeks_count if block.weeks_count else None

        block.save(update_fields=['starts_on', 'ends_on', 'weeks_count', 'workload'])


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0011_subjectblock_weeks_count_subjectblock_workload'),
        ('lessons', '0022_remove_lessonsubmission_tutor_feedback_image'),
    ]

    operations = [
        migrations.RunPython(backfill_block_dates_and_workload, migrations.RunPython.noop),
    ]
