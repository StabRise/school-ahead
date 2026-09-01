from academics.services import parse_subject_markdown

SAMPLE = """\
Class: 5
Subject: PL:Historia
SubjectBlocks: 1
Description:
https://example.com/plan

Extra data:
# Platforma:
https://example.com/plan

## Wprowadzenie
H4.01 Czym jest historia
    Task: Historia – nauka o przeszłości (str. 4-5)

## Pierwsze cywilizacje

H5.01 Życie pierwszych ludzi
  [Link one](https://example.com/1)
  [Link two](https://example.com/2)
  Task: Napisz Konspekt.

H5.03.1 Starożytny Egipt
   Repetytorium: Egipt 63
   Task: Napisz Konspekt A.

H5.03.1 Starożytny Egipt
   Repetytorium: Egipt 64
   Task: Napisz Konspekt B.

H5.06 Pismo i alfabet
  [Link three](https://example.com/3)
"""


def test_parses_header_fields():
    plan = parse_subject_markdown(SAMPLE)
    assert plan.subject_name == 'Historia'
    assert plan.block_count == 1
    assert 'https://example.com/plan' in plan.description


def test_strips_curriculum_prefix_only_for_short_codes():
    plan = parse_subject_markdown('Subject: Not:APrefixLongEnough\n\n## T\nL1\n  content\n')
    # "Not" is 3 letters so it still matches the "XX:" prefix pattern and is stripped.
    assert plan.subject_name == 'APrefixLongEnough'


def test_parses_topics_and_lessons():
    plan = parse_subject_markdown(SAMPLE)
    assert [t.title for t in plan.topics] == ['Wprowadzenie', 'Pierwsze cywilizacje']

    intro, ancient = plan.topics
    assert len(intro.lessons) == 1
    assert intro.lessons[0].title == 'H4.01 Czym jest historia'
    assert intro.lessons[0].task_content == 'Historia – nauka o przeszłości (str. 4-5)'
    assert intro.lessons[0].content == ''

    assert [l.title for l in ancient.lessons] == [
        'H5.01 Życie pierwszych ludzi',
        'H5.03.1 Starożytny Egipt',
        'H5.06 Pismo i alfabet',
    ]

    first_lesson = ancient.lessons[0]
    assert '[Link one](https://example.com/1)' in first_lesson.content
    assert '[Link two](https://example.com/2)' in first_lesson.content
    assert first_lesson.task_content == 'Napisz Konspekt.'


def test_merges_consecutive_lessons_sharing_a_title():
    plan = parse_subject_markdown(SAMPLE)
    ancient = plan.topics[1]
    egypt = next(l for l in ancient.lessons if l.title == 'H5.03.1 Starożytny Egipt')

    assert 'Repetytorium: Egipt 63' in egypt.content
    assert 'Repetytorium: Egipt 64' in egypt.content
    assert egypt.task_content == 'Napisz Konspekt A.\n\nNapisz Konspekt B.'


def test_lesson_with_no_task_line_has_empty_task_content():
    plan = parse_subject_markdown(SAMPLE)
    ancient = plan.topics[1]
    last_lesson = ancient.lessons[-1]
    assert last_lesson.title == 'H5.06 Pismo i alfabet'
    assert last_lesson.task_content == ''
