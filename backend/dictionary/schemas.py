import datetime

from ninja import Schema


class DictionaryItemOut(Schema):
    id: int
    text: str
    lang: str
    translation: str
    sample: str
    sample_translation: str
    status: str
    created_at: datetime.datetime


class AddDictionaryItemIn(Schema):
    text: str
    lang: str
    translation: str
    sample: str
    sample_translation: str


class UpdateDictionaryItemStatusIn(Schema):
    status: str


class UpdateDictionaryItemTranslationIn(Schema):
    translation: str
