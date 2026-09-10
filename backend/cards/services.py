from lessons.models import StudentLesson

from .models import StudentCard


def add_card(student_lesson: StudentLesson, *, term: str, translation: str, definition: str = '') -> StudentCard:
    """Saves a translated word/phrase from `student_lesson` as a personal
    flashcard, appended after any existing cards for the same (student,
    lesson) pair — same .count()-based order_index pattern as
    lessons/services.py::add_material."""
    lesson = student_lesson.lesson
    order_index = StudentCard.objects.filter(student=student_lesson.student, lesson=lesson).count()
    return StudentCard.objects.create(
        student=student_lesson.student,
        lesson=lesson,
        term=term,
        translation=translation,
        definition=definition,
        order_index=order_index,
    )
