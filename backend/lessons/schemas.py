import datetime

from ninja import Schema


class QuizChoiceOut(Schema):
    id: int
    text: str


class QuizQuestionOut(Schema):
    id: int
    prompt: str
    order_index: int
    choices: list[QuizChoiceOut]

    @staticmethod
    def resolve_choices(obj):
        # Never expose is_correct to the student.
        return list(obj.choices.all())


class LessonAttachmentOut(Schema):
    id: int
    file: str | None
    url: str
    kind: str
    title: str
    order_index: int

    @staticmethod
    def resolve_file(obj):
        return obj.file.url if obj.file else None


class LessonOut(Schema):
    id: int
    topic_id: int
    order_index: int
    title: str
    lesson_type: str
    grading_type: str
    content: str
    materials: list[LessonAttachmentOut]
    quiz_questions: list[QuizQuestionOut]

    @staticmethod
    def resolve_materials(obj):
        return list(obj.materials.all())

    @staticmethod
    def resolve_quiz_questions(obj):
        return list(obj.quiz_questions.all())


class StudentLessonOut(Schema):
    id: int
    lesson: LessonOut
    status: str
    scheduled_date: datetime.date
    is_manually_scheduled: bool
    started_at: datetime.datetime | None
    completed_at: datetime.datetime | None
    grade_points: int | None
    grade_result: str | None
    quiz_score_percent: float | None
    attempt_count: int
    help_note: str
    tutor_feedback: str


class SubmitQuizIn(Schema):
    answers: dict[int, int]


class SubmitQuizOut(Schema):
    score_percent: float
    student_lesson: StudentLessonOut


class ConfirmUnderstandingIn(Schema):
    understood: bool


class RequestHelpIn(Schema):
    note: str = ''
