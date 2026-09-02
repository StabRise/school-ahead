from accounts.models import StudentProfile

from .models import DictionaryItem


def add_dictionary_item(
    student: StudentProfile, *, text: str, lang: str, translation: str, sample: str, sample_translation: str
) -> DictionaryItem:
    return DictionaryItem.objects.create(
        student=student,
        text=text,
        lang=lang,
        translation=translation,
        sample=sample,
        sample_translation=sample_translation,
    )
