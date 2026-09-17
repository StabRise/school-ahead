# Hand-written: ties StudentCustomTopic to a real academics.Subject
# (picked/confirmed by the student at import time) instead of a per-student
# StudentCustomSubject bucket — so an imported deck always shows up on that
# real Subject's own Картки tab, never in a separate "Мої картки" group.
# Depends on 0004, which already deleted every row this schema change can't
# carry forward (StudentCustomSubject rows have no real Subject to
# backfill into) — that deletion had to be its own migration/transaction,
# since Postgres refuses an ALTER TABLE right after a DELETE that leaves
# deferred FK trigger events pending on the same table.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0018_reorder_subject_groups'),
        ('accounts', '0032_crop_avatar_item_padding'),
        ('cards', '0004_delete_unmappable_custom_cards'),
    ]

    operations = [
        # Drop the old (subject, title) unique constraint FIRST — it's
        # composed over the old `subject` column, so removing that column
        # below would otherwise destroy the constraint implicitly and leave
        # AlterUniqueTogether unable to find it to drop.
        migrations.AlterUniqueTogether(
            name='studentcustomtopic',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='studentcustomtopic',
            name='subject',
        ),
        migrations.AddField(
            model_name='studentcustomtopic',
            name='subject',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='student_custom_topics',
                to='academics.subject',
            ),
        ),
        migrations.AddField(
            model_name='studentcustomtopic',
            name='student',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='custom_topics',
                to='accounts.studentprofile',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='studentcustomtopic',
            unique_together={('student', 'subject', 'title')},
        ),
        migrations.DeleteModel(
            name='StudentCustomSubject',
        ),
    ]
