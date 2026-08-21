from rest_framework import serializers

from mcp_server import MCPToolset, ModelQueryToolset

from common.mcp_auth import StaffOrTutorScopedQueryToolset, ensure_mcp_staff_or_tutor

from . import services
from .models import Subject, Topic


class SubjectQueryTool(StaffOrTutorScopedQueryToolset, ModelQueryToolset):
    model = Subject


class TopicQueryTool(StaffOrTutorScopedQueryToolset, ModelQueryToolset):
    model = Topic


class SubjectCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'school_class', 'name', 'description', 'recommended_resources',
                  'block_count', 'start_date', 'due_date']
        read_only_fields = ['id']
        extra_kwargs = {
            'start_date': {'required': False, 'allow_null': True},
            'due_date': {'required': False, 'allow_null': True},
        }

    def create(self, validated_data):
        subject = super().create(validated_data)
        services.ensure_subject_blocks(subject)
        services.assign_topics_to_blocks(subject)
        return subject


class TopicCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['id', 'subject', 'title', 'description', 'order_index']
        read_only_fields = ['id']

    def create(self, validated_data):
        topic = super().create(validated_data)
        services.assign_topics_to_blocks(topic.subject)
        return topic


class AcademicsWriteTools(MCPToolset):
    """Tools for creating curriculum structure. Requires staff or tutor access."""

    def create_subject(self, school_class: int, name: str, description: str = '',
                        recommended_resources: str = '', block_count: int = 2,
                        start_date: str | None = None, due_date: str | None = None) -> dict:
        """Create a Subject under an existing Class (school_class id). Mirrors
        POST /api/academics/subjects: auto-creates SubjectBlocks and reassigns
        topics to them afterward. start_date/due_date (YYYY-MM-DD) are
        optional -- Subject.save() fills in sensible defaults when omitted."""
        ensure_mcp_staff_or_tutor(self.request)
        serializer = SubjectCreateSerializer(data={
            'school_class': school_class,
            'name': name,
            'description': description,
            'recommended_resources': recommended_resources,
            'block_count': block_count,
            'start_date': start_date,
            'due_date': due_date,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def create_topic(self, subject: int, title: str, order_index: int, description: str = '') -> dict:
        """Create a Topic under an existing Subject. Reassigns topic-to-block
        placement afterward, same as POST /api/academics/topics."""
        ensure_mcp_staff_or_tutor(self.request)
        serializer = TopicCreateSerializer(data={
            'subject': subject,
            'title': title,
            'order_index': order_index,
            'description': description,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data
