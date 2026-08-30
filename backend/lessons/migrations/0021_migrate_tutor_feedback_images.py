from django.db import migrations


def copy_images_forward(apps, schema_editor):
    LessonSubmission = apps.get_model('lessons', 'LessonSubmission')
    LessonSubmissionFeedbackImage = apps.get_model('lessons', 'LessonSubmissionFeedbackImage')
    for submission in LessonSubmission.objects.exclude(tutor_feedback_image=''):
        LessonSubmissionFeedbackImage.objects.create(submission=submission, file=submission.tutor_feedback_image)


def copy_images_backward(apps, schema_editor):
    LessonSubmissionFeedbackImage = apps.get_model('lessons', 'LessonSubmissionFeedbackImage')
    for image in LessonSubmissionFeedbackImage.objects.select_related('submission').order_by('id'):
        image.submission.tutor_feedback_image = image.file
        image.submission.save(update_fields=['tutor_feedback_image'])


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0020_lessonsubmissionfeedbackimage'),
    ]

    operations = [
        migrations.RunPython(copy_images_forward, copy_images_backward),
    ]
