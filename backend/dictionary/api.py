from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError
from ninja.responses import Status

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import get_own_student_profile
from lessons.models import MaterialLanguage

from . import services
from .models import DictionaryItem, DictionaryItemStatus
from .schemas import (
    AddDictionaryItemIn,
    DictionaryItemOut,
    UpdateDictionaryItemStatusIn,
)

router = Router(tags=['dictionary'])

MAX_TEXT_WORDS = 5


def _get_owned_item(request: HttpRequest, item_id: int) -> DictionaryItem:
    student = get_own_student_profile(request)
    item = get_object_or_404(DictionaryItem, id=item_id)
    if item.student_id != student.id:
        raise HttpError(403, 'Not the owner of this dictionary item')
    return item


@router.get('', response=list[DictionaryItemOut], auth=CookieOrBearerJWTAuth(), operation_id='list_dictionary_items')
def list_dictionary_items(request: HttpRequest):
    student = get_own_student_profile(request)
    return list(student.dictionary_items.all())


@router.post('', response=DictionaryItemOut, auth=CookieOrBearerJWTAuth(), operation_id='add_dictionary_item')
def add_dictionary_item(request: HttpRequest, payload: AddDictionaryItemIn):
    """Saves a translated word/phrase to the student's personal dictionary
    — see the frontend's "Додати до словника" button, offered only for a
    1-5 word selection. Re-checked here since the frontend gating is only a
    UX nicety, not a security boundary."""
    require_csrf(request)
    if payload.lang not in MaterialLanguage.values:
        raise HttpError(400, 'Invalid lang')
    word_count = len(payload.text.split())
    if not 1 <= word_count <= MAX_TEXT_WORDS:
        raise HttpError(400, f'text must be 1-{MAX_TEXT_WORDS} words')

    student = get_own_student_profile(request)
    return services.add_dictionary_item(
        student,
        text=payload.text,
        lang=payload.lang,
        translation=payload.translation,
        sample=payload.sample,
        sample_translation=payload.sample_translation,
    )


@router.patch(
    '/{item_id}/status',
    response=DictionaryItemOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_dictionary_item_status',
)
def update_dictionary_item_status(request: HttpRequest, item_id: int, payload: UpdateDictionaryItemStatusIn):
    require_csrf(request)
    if payload.status not in DictionaryItemStatus.values:
        raise HttpError(400, 'Invalid status')

    item = _get_owned_item(request, item_id)
    item.status = payload.status
    item.save(update_fields=['status'])
    return item


@router.delete(
    '/{item_id}',
    response={204: None},
    auth=CookieOrBearerJWTAuth(),
    operation_id='delete_dictionary_item',
)
def delete_dictionary_item(request: HttpRequest, item_id: int):
    require_csrf(request)
    _get_owned_item(request, item_id).delete()
    return Status(204, None)
