import pytest

from academics.models import Class, School, Subject
from lessons.models import GradingType, Lesson, LessonType
from lessons.services import build_lesson_content, import_topics_and_lessons

pytestmark = pytest.mark.django_db


@pytest.fixture
def subject():
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    return Subject.objects.create(school_class=school_class, name='English')


def test_quiz_lesson_type_is_normalized_and_graded_by_points(subject):
    topics_data = [
        {
            'title': 'Block 1',
            'lessons': [
                {
                    'title': 'Hello Song',
                    'lesson_type': 'quiz',
                    'youtubes': ['https://www.youtube.com/watch?v=abc'],
                    'quiz': [],
                },
            ],
        },
    ]

    import_topics_and_lessons(subject, topics_data)

    lesson = Lesson.objects.get(title='Hello Song')
    assert lesson.lesson_type == LessonType.WITH_QUIZ
    assert lesson.grading_type == GradingType.POINTS


def test_quiz_questions_and_choices_are_created_first_choice_correct_by_default(subject):
    topics_data = [
        {
            'title': 'Block 1',
            'lessons': [
                {
                    'title': 'Hello Song',
                    'lesson_type': 'quiz',
                    'quiz': [
                        {
                            'prompt': 'What do you say when you meet someone?',
                            'order_index': 1,
                            'language': 'en',
                            'choices': [
                                {'text': 'Hello', 'image': None},
                                {'text': 'Goodbye', 'image': None},
                            ],
                        },
                    ],
                },
            ],
        },
    ]

    import_topics_and_lessons(subject, topics_data)

    lesson = Lesson.objects.get(title='Hello Song')
    question = lesson.quiz_questions.get()
    assert question.prompt == 'What do you say when you meet someone?'
    assert question.language == 'en'
    choices = {c.text: c.is_correct for c in question.choices.all()}
    assert choices == {'Hello': True, 'Goodbye': False}


def test_quiz_choice_explicit_is_correct_overrides_first_choice_convention(subject):
    topics_data = [
        {
            'title': 'Block 1',
            'lessons': [
                {
                    'title': 'Hello Song',
                    'lesson_type': 'quiz',
                    'quiz': [
                        {
                            'prompt': 'Pick one',
                            'choices': [
                                {'text': 'Wrong', 'is_correct': False},
                                {'text': 'Right', 'is_correct': True},
                            ],
                        },
                    ],
                },
            ],
        },
    ]

    import_topics_and_lessons(subject, topics_data)

    question = Lesson.objects.get(title='Hello Song').quiz_questions.get()
    choices = {c.text: c.is_correct for c in question.choices.all()}
    assert choices == {'Wrong': False, 'Right': True}


def test_build_lesson_content_embeds_youtubes_not_already_in_content():
    content, _ = build_lesson_content({
        'title': 'Hello Song',
        'youtubes': ['https://www.youtube.com/watch?v=abc'],
        'content': '# Words:\nHello!\nGoodbye!',
    })
    assert content == 'https://www.youtube.com/watch?v=abc\n\n# Words:\nHello!\nGoodbye!'


def test_build_lesson_content_skips_youtube_already_embedded_in_content():
    scraped_content = 'https://www.youtube.com/watch?v=abc\n\n## Конспект\n\nsome notes'
    content, _ = build_lesson_content({
        'title': 'Lesson',
        'youtubes': ['https://www.youtube.com/watch?v=abc'],
        'content': scraped_content,
    })
    assert content == scraped_content


def test_extra_content_is_appended_at_end_of_content_as_markdown():
    content, _ = build_lesson_content({
        'title': 'Lesson',
        'content': '# Intro',
        'extra_content': [
            {'name': 'Homework', 'content': 'Read chapter 1', 'type': 'text'},
        ],
    })
    assert content == '# Intro\n\n## Homework\n\nRead chapter 1'


def test_extra_content_plain_string_items_are_used_as_is():
    content, _ = build_lesson_content({
        'title': 'Lesson',
        'content': '# Intro',
        'extra_content': ['## Homework\n\nRead chapter 1'],
    })
    assert content == '# Intro\n\n## Homework\n\nRead chapter 1'
