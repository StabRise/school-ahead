from django.db.models import QuerySet
from ninja.errors import HttpError

from academics.models import Subject
from accounts.models import Role, TutorProfile, User

from .models import TutorSubjectAssignment


def get_tutor_subject_ids(user: User) -> QuerySet:
    """The single scope-filter helper every tutor-facing query uses. See
    docs/architecture/04-api-design.md."""
    tutor_profile = getattr(user, 'tutor_profile', None)
    if tutor_profile is None:
        return TutorSubjectAssignment.objects.none().values_list('subject_id', flat=True)
    return TutorSubjectAssignment.objects.filter(
        tutor=tutor_profile, is_active=True
    ).values_list('subject_id', flat=True)


def ensure_is_tutor_for_subject(request, subject_id: int) -> None:
    """403s unless the authenticated user is an active tutor for this
    subject (admins hold real TutorSubjectAssignment rows too — see decision
    7 below — so no special-casing is needed here)."""
    if subject_id not in get_tutor_subject_ids(request.auth):
        raise HttpError(403, 'Not a tutor for this subject')


def _get_or_create_tutor_profile(user: User) -> TutorProfile:
    tutor_profile, _created = TutorProfile.objects.get_or_create(user=user)
    return tutor_profile


def assign_admins_to_subject(subject: Subject) -> None:
    """On Subject creation: assign every current admin to it. See
    docs/architecture/02-data-model.md decision 7."""
    for admin_user in User.objects.filter(role=Role.ADMIN):
        tutor_profile = _get_or_create_tutor_profile(admin_user)
        TutorSubjectAssignment.objects.get_or_create(tutor=tutor_profile, subject=subject)


def assign_admin_to_all_subjects(admin_user: User) -> None:
    """On a User being granted role=admin: assign that admin to every
    existing subject. See docs/architecture/02-data-model.md decision 7."""
    tutor_profile = _get_or_create_tutor_profile(admin_user)
    for subject in Subject.objects.all():
        TutorSubjectAssignment.objects.get_or_create(tutor=tutor_profile, subject=subject)
