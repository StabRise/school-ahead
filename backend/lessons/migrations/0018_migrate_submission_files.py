from django.db import migrations


def copy_files_forward(apps, schema_editor):
    LessonSubmission = apps.get_model('lessons', 'LessonSubmission')
    LessonSubmissionFile = apps.get_model('lessons', 'LessonSubmissionFile')
    for submission in LessonSubmission.objects.exclude(file=''):
        LessonSubmissionFile.objects.create(submission=submission, file=submission.file)


def copy_files_backward(apps, schema_editor):
    LessonSubmissionFile = apps.get_model('lessons', 'LessonSubmissionFile')
    for submission_file in LessonSubmissionFile.objects.select_related('submission'):
        submission_file.submission.file = submission_file.file
        submission_file.submission.save(update_fields=['file'])


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0017_lessonsubmissionfile'),
    ]

    operations = [
        migrations.RunPython(copy_files_forward, copy_files_backward),
    ]
