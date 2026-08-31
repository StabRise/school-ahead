from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from academics.models import Subject
from accounts.models import Role, User

from . import services


@receiver(post_save, sender=Subject)
def on_subject_created(sender, instance, created, **kwargs):
    if created:
        services.assign_admins_to_subject(instance)
        services.assign_class_teacher_to_subject(instance)


@receiver(pre_save, sender=User)
def stash_old_role(sender, instance, **kwargs):
    if instance.pk:
        instance._old_role = User.objects.filter(pk=instance.pk).values_list('role', flat=True).first()
    else:
        instance._old_role = None


@receiver(post_save, sender=User)
def on_user_role_changed(sender, instance, created, **kwargs):
    old_role = getattr(instance, '_old_role', None)
    if instance.role == Role.ADMIN and old_role != Role.ADMIN:
        services.assign_admin_to_all_subjects(instance)
