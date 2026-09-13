"""Cyrillic-aware slug generation for Story.slug (see models.py).

django.utils.text.slugify's NFKD-then-ASCII-encode step has no Cyrillic
decomposition, so it silently drops every Cyrillic character rather than
transliterating it — a title like "Колобок" would slugify to "" instead of
something usable. slugify_title transliterates first (this module's own
table), then hands off to slugify() for the usual cleanup.

Pure functions, no model imports, so this is safely importable from
migrations without pulling in historical-model machinery.
"""

from django.utils.text import slugify

# Ukrainian alphabet, plus a few Russian-only letters as a safety net for
# titles that stray outside Ukrainian (ё, ъ, ы, э). Single table, not
# position-dependent (unlike formal passport-transliteration standards
# which special-case word-initial є/ї/й/ю/я) — this is a URL slug, not an
# official document, so one consistent mapping per letter is enough.
UK_TRANSLIT_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e',
    'є': 'ie', 'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'i', 'й': 'i',
    'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
    'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'iu', 'я': 'ia',
    # Russian-only extras
    'ё': 'e', 'ъ': '', 'ы': 'y', 'э': 'e',
}


def transliterate(text: str) -> str:
    return ''.join(UK_TRANSLIT_MAP.get(ch, ch) for ch in text.lower())


def slugify_title(title: str) -> str:
    return slugify(transliterate(title))
