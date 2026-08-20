from django.contrib import admin

from .models import (
    Lesson,
    LessonAttachment,
    LessonSubmission,
    QuizChoice,
    QuizQuestion,
    StudentLesson,
    StudentLessonStatusEvent,
)

admin.site.register(Lesson)
admin.site.register(LessonAttachment)
admin.site.register(QuizQuestion)
admin.site.register(QuizChoice)
admin.site.register(StudentLesson)
admin.site.register(LessonSubmission)
admin.site.register(StudentLessonStatusEvent)
