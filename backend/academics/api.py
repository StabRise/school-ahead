from django.db.models import Exists, OuterRef
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import get_own_student_profile
from tutoring.services import ensure_is_tutor_for_subject

from . import services
from .models import Class, School, Subject, SubjectGroup, SubjectMaterial, Topic
from .schemas import (
    ClassIn,
    ClassOut,
    SchoolIn,
    SchoolOut,
    SubjectGroupOut,
    SubjectIn,
    SubjectMaterialOut,
    SubjectOut,
    SubjectPatchIn,
    TopicIn,
    TopicOut,
    TopicsReorderIn,
)

router = Router(tags=['academics'], auth=CookieOrBearerJWTAuth())


def _ensure_staff(request: HttpRequest) -> None:
    """Also enforces CSRF, since every caller of this is about to mutate
    something — see common/csrf.py."""
    require_csrf(request)
    if not request.auth.is_staff:
        raise HttpError(403, 'Admin only')


@router.get('/classes', response=list[ClassOut])
def list_classes(request: HttpRequest):
    return Class.objects.select_related('class_teacher__user').all()


@router.get('/subject-groups', response=list[SubjectGroupOut], operation_id='list_subject_groups')
def list_subject_groups(request: HttpRequest):
    """Global curriculum-track groups a subject can optionally belong to
    (Subject.group) — e.g. "Українська школа" / "Польська школа". Not
    scoped to a class or school. Every role can read this."""
    return SubjectGroup.objects.all()


@router.get('/classes/{class_id}/subjects', response=list[SubjectOut])
def list_class_subjects(request: HttpRequest, class_id: int):
    return Subject.objects.filter(school_class_id=class_id).select_related('school_class', 'group')


@router.get('/my-subjects', response=list[SubjectOut], operation_id='get_my_subjects')
def my_subjects(request: HttpRequest, has_lessons: bool = False):
    """Subjects for the authenticated student's own class. See
    docs/interfaces/student/progress.md. `has_lessons=true` leaves out
    subjects with no lessons at all — the preschool bookshelf uses it so a
    child isn't shown books with nothing in them."""
    student = get_own_student_profile(request)
    if student.school_class_id is None:
        return []
    subjects = Subject.objects.filter(school_class_id=student.school_class_id).select_related('school_class', 'group')
    if has_lessons:
        subjects = subjects.filter(Exists(Topic.objects.filter(subject=OuterRef('pk'), lessons__isnull=False)))
    return subjects


@router.get('/subjects/{subject_id}', response=SubjectOut, operation_id='get_subject')
def get_subject(request: HttpRequest, subject_id: int):
    return get_object_or_404(Subject.objects.select_related('school_class', 'group'), id=subject_id)


@router.get('/subjects/{subject_id}/topics', response=list[TopicOut], operation_id='list_subject_topics')
def list_subject_topics(request: HttpRequest, subject_id: int):
    return Topic.objects.filter(subject_id=subject_id).select_related('subject_block')


@router.get('/topics/{topic_id}', response=TopicOut, operation_id='get_topic')
def get_topic(request: HttpRequest, topic_id: int):
    return get_object_or_404(Topic.objects.select_related('subject_block'), id=topic_id)


@router.get('/subjects/{subject_id}/materials', response=list[SubjectMaterialOut], operation_id='list_subject_materials')
def list_subject_materials(request: HttpRequest, subject_id: int):
    return SubjectMaterial.objects.filter(subject_id=subject_id)


@router.post('/subjects/{subject_id}/materials', response=SubjectMaterialOut, operation_id='add_subject_material')
def add_subject_material(
    request: HttpRequest,
    subject_id: int,
    title: str = Form(''),
    file: UploadedFile = File(...),
):
    require_csrf(request)
    ensure_is_tutor_for_subject(request, subject_id)
    if not file.name.lower().endswith('.pdf'):
        raise HttpError(400, 'Only PDF files are supported')

    subject = get_object_or_404(Subject, id=subject_id)
    return SubjectMaterial.objects.create(
        subject=subject,
        file=file,
        title=title,
        order_index=subject.materials.count(),
    )


@router.delete('/materials/{material_id}', operation_id='delete_subject_material')
def delete_subject_material(request: HttpRequest, material_id: int, response: HttpResponse):
    require_csrf(request)
    material = get_object_or_404(SubjectMaterial, id=material_id)
    ensure_is_tutor_for_subject(request, material.subject_id)
    material.delete()
    response.status_code = 204
    return response


@router.patch('/subjects/{subject_id}', response=SubjectOut)
def patch_subject(request: HttpRequest, subject_id: int, payload: SubjectPatchIn):
    _ensure_staff(request)
    subject = get_object_or_404(Subject, id=subject_id)

    if payload.start_date is not None:
        subject.start_date = payload.start_date
    if payload.due_date is not None:
        subject.due_date = payload.due_date
    if payload.block_count is not None:
        subject.block_count = payload.block_count
    if payload.group_id is not None:
        subject.group_id = payload.group_id
    if payload.order_index is not None:
        subject.order_index = payload.order_index
    if payload.attestation_type is not None:
        subject.attestation_type = payload.attestation_type

    subject.save()
    services.ensure_subject_blocks(subject)
    services.assign_topics_to_blocks(subject)
    return subject


@router.patch('/subjects/{subject_id}/topics/reorder')
def reorder_topics(request: HttpRequest, subject_id: int, payload: TopicsReorderIn):
    _ensure_staff(request)
    subject = get_object_or_404(Subject, id=subject_id)
    topics_by_id = {t.id: t for t in Topic.objects.filter(subject_id=subject_id)}

    updated = []
    for item in payload.items:
        topic = topics_by_id.get(item.id)
        if topic is None:
            raise HttpError(404, f'Topic {item.id} not found in this subject')
        topic.order_index = item.order_index
        updated.append(topic)

    Topic.objects.bulk_update(updated, ['order_index'])
    services.assign_topics_to_blocks(subject)
    return {'updated': len(updated)}


@router.post('/schools', response=SchoolOut)
def create_school(request: HttpRequest, payload: SchoolIn):
    _ensure_staff(request)
    return School.objects.create(**payload.dict())


@router.put('/schools/{school_id}', response=SchoolOut)
def update_school(request: HttpRequest, school_id: int, payload: SchoolIn):
    _ensure_staff(request)
    school = get_object_or_404(School, id=school_id)
    for field, value in payload.dict().items():
        setattr(school, field, value)
    school.save()
    return school


@router.delete('/schools/{school_id}')
def delete_school(request: HttpRequest, school_id: int, response: HttpResponse):
    _ensure_staff(request)
    get_object_or_404(School, id=school_id).delete()
    response.status_code = 204
    return response


@router.post('/classes', response=ClassOut)
def create_class(request: HttpRequest, payload: ClassIn):
    _ensure_staff(request)
    return Class.objects.create(**payload.dict())


@router.put('/classes/{class_id}', response=ClassOut)
def update_class(request: HttpRequest, class_id: int, payload: ClassIn):
    _ensure_staff(request)
    school_class = get_object_or_404(Class, id=class_id)
    for field, value in payload.dict().items():
        setattr(school_class, field, value)
    school_class.save()
    return school_class


@router.delete('/classes/{class_id}')
def delete_class(request: HttpRequest, class_id: int, response: HttpResponse):
    _ensure_staff(request)
    get_object_or_404(Class, id=class_id).delete()
    response.status_code = 204
    return response


@router.post('/subjects', response=SubjectOut)
def create_subject(request: HttpRequest, payload: SubjectIn):
    _ensure_staff(request)
    subject = Subject.objects.create(**payload.dict())
    update_fields = []
    if not subject.color:
        subject.color = services.assign_subject_color(subject)
        update_fields.append('color')
    if not subject.order_index:
        subject.order_index = services.assign_subject_order_index(subject)
        update_fields.append('order_index')
    if update_fields:
        subject.save(update_fields=update_fields)
    services.ensure_subject_blocks(subject)
    services.assign_topics_to_blocks(subject)
    return subject


@router.put('/subjects/{subject_id}', response=SubjectOut)
def update_subject(request: HttpRequest, subject_id: int, payload: SubjectIn):
    _ensure_staff(request)
    subject = get_object_or_404(Subject, id=subject_id)
    for field, value in payload.dict().items():
        setattr(subject, field, value)
    if not subject.color:
        subject.color = services.assign_subject_color(subject)
    subject.save()
    services.ensure_subject_blocks(subject)
    services.assign_topics_to_blocks(subject)
    return subject


@router.delete('/subjects/{subject_id}')
def delete_subject(request: HttpRequest, subject_id: int, response: HttpResponse):
    _ensure_staff(request)
    get_object_or_404(Subject, id=subject_id).delete()
    response.status_code = 204
    return response


@router.post('/topics', response=TopicOut)
def create_topic(request: HttpRequest, payload: TopicIn):
    _ensure_staff(request)
    subject = get_object_or_404(Subject, id=payload.subject_id)
    topic = Topic.objects.create(**payload.dict())
    services.assign_topics_to_blocks(subject)
    topic.refresh_from_db()
    return topic


@router.put('/topics/{topic_id}', response=TopicOut)
def update_topic(request: HttpRequest, topic_id: int, payload: TopicIn):
    _ensure_staff(request)
    topic = get_object_or_404(Topic, id=topic_id)
    for field, value in payload.dict().items():
        setattr(topic, field, value)
    topic.save()
    services.assign_topics_to_blocks(topic.subject)
    topic.refresh_from_db()
    return topic


@router.delete('/topics/{topic_id}')
def delete_topic(request: HttpRequest, topic_id: int, response: HttpResponse):
    _ensure_staff(request)
    topic = get_object_or_404(Topic, id=topic_id)
    subject = topic.subject
    topic.delete()
    services.assign_topics_to_blocks(subject)
    response.status_code = 204
    return response
