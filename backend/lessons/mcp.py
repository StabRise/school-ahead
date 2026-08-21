from rest_framework import serializers

from mcp_server import MCPToolset, ModelQueryToolset

from common.mcp_auth import StaffOrTutorScopedQueryToolset, ensure_mcp_staff_or_tutor

from .models import Lesson, LessonAttachment, QuizChoice, QuizQuestion


class LessonQueryTool(StaffOrTutorScopedQueryToolset, ModelQueryToolset):
    model = Lesson


class LessonAttachmentQueryTool(StaffOrTutorScopedQueryToolset, ModelQueryToolset):
    model = LessonAttachment


class QuizQuestionQueryTool(StaffOrTutorScopedQueryToolset, ModelQueryToolset):
    model = QuizQuestion


class QuizChoiceQueryTool(StaffOrTutorScopedQueryToolset, ModelQueryToolset):
    model = QuizChoice


class LessonCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ['id', 'topic', 'order_index', 'title', 'lesson_type', 'grading_type',
                  'content', 'task_content', 'default_day_offset']
        read_only_fields = ['id']


class LessonAttachmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonAttachment
        fields = ['id', 'lesson', 'url', 'kind', 'title', 'order_index']
        read_only_fields = ['id']


class QuizQuestionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        fields = ['id', 'lesson', 'prompt', 'order_index']
        read_only_fields = ['id']


class QuizChoiceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizChoice
        fields = ['id', 'question', 'text', 'is_correct']
        read_only_fields = ['id']


class LessonsWriteTools(MCPToolset):
    """Tools for creating lessons and their attachments/quiz content. Requires
    staff or tutor access."""

    def create_lesson(self, topic: int, order_index: int, title: str, lesson_type: str,
                       grading_type: str, content: str = '', task_content: str = '',
                       default_day_offset: int | None = None) -> dict:
        """Create a Lesson under an existing Topic. order_index must be unique
        within the topic. lesson_type is one of 'with_quiz', 'theory',
        'with_task'; grading_type is 'points' or 'binary'."""
        ensure_mcp_staff_or_tutor(self.request)
        serializer = LessonCreateSerializer(data={
            'topic': topic,
            'order_index': order_index,
            'title': title,
            'lesson_type': lesson_type,
            'grading_type': grading_type,
            'content': content,
            'task_content': task_content,
            'default_day_offset': default_day_offset,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def create_lesson_attachment(self, lesson: int, kind: str, url: str = '',
                                  title: str = '', order_index: int = 0) -> dict:
        """Add a link or video attachment to an existing Lesson via a url.
        File uploads aren't supported over MCP (JSON-only transport) -- use
        kind='link' or kind='video' with a url; kind='file' attachments still
        require the regular web UI upload flow."""
        ensure_mcp_staff_or_tutor(self.request)
        serializer = LessonAttachmentCreateSerializer(data={
            'lesson': lesson,
            'kind': kind,
            'url': url,
            'title': title,
            'order_index': order_index,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def create_quiz_question(self, lesson: int, prompt: str, order_index: int = 0) -> dict:
        """Add a quiz question to an existing Lesson. Add its answer choices
        afterward with create_quiz_choice, referencing this question's id."""
        ensure_mcp_staff_or_tutor(self.request)
        serializer = QuizQuestionCreateSerializer(data={
            'lesson': lesson,
            'prompt': prompt,
            'order_index': order_index,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def create_quiz_choice(self, question: int, text: str, is_correct: bool = False) -> dict:
        """Add an answer choice to an existing QuizQuestion. Set
        is_correct=true on exactly the choice(s) that should count as
        correct."""
        ensure_mcp_staff_or_tutor(self.request)
        serializer = QuizChoiceCreateSerializer(data={
            'question': question,
            'text': text,
            'is_correct': is_correct,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data
