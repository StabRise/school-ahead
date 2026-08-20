import datetime

from django.contrib.auth.hashers import make_password
from django.db import migrations

ACADEMIC_YEAR = '2026/2027'
START_DATE = datetime.date(2026, 9, 1)
DUE_DATE = datetime.date(2027, 6, 1)

SUBJECTS_5 = [
    'Українська мова',
    'Українська література',
    'Зарубіжна література',
    'Англійська',
    'Eng Preply',
    'Математика',
    'Вступ до історії України',
    'Пізнаємо природу',
    'Інформатика',
    "Здоров'я, безпека та добробут",
    'Мистецтво',
    'Технології',
]

SUBJECTS_8 = [
    'Українська мова',
    'Українська література',
    'Зарубіжна література',
    'Англійська',
    'Eng Preply',
    'Алгебра',
    'Геометрія',
    'Історія України',
    'Всесвітня історія',
    'Фізика',
    'Хімія',
    'Біологія',
    'Географія',
    'Інформатика',
    "Здоров'я, безпека та добробут",
    'Громадянська освіта',
    'Мистецтво',
    'Технології',
]

SUBJECTS_PRE = [
    'Математика',
    'Англійська',
    'Малювання',
    'Мова',
    'Література',
]

STUDENTS = [
    ('pdf.redaction.com@gmail.com', 'pre', None),
    ('happy.boy.mykhailo@gmail.com', '5', 'password'),
    ('slavko.melnyk@gmail.com', '8', 'password'),
]


def seed_data(apps, schema_editor):
    School = apps.get_model('academics', 'School')
    Class = apps.get_model('academics', 'Class')
    Subject = apps.get_model('academics', 'Subject')
    SubjectBlock = apps.get_model('academics', 'SubjectBlock')
    User = apps.get_model('accounts', 'User')
    StudentProfile = apps.get_model('accounts', 'StudentProfile')

    school = School.objects.create(name='Школа')

    classes = {
        'pre': Class.objects.create(
            school=school, name='Pre', order_index=0, academic_year=ACADEMIC_YEAR
        ),
        '5': Class.objects.create(
            school=school, name='5', order_index=5, academic_year=ACADEMIC_YEAR
        ),
        '8': Class.objects.create(
            school=school, name='8', order_index=8, academic_year=ACADEMIC_YEAR
        ),
    }

    for email, class_key, password in STUDENTS:
        # Historical models from apps.get_model() lack AbstractBaseUser
        # methods like set_password(), so hash directly with make_password()
        # instead of going through create_user(). make_password(None)
        # produces the same unusable-password marker set_unusable_password()
        # would, for the Google-only account with no password given.
        user = User.objects.create(
            email=email,
            password=make_password(password),
            role='student',
            is_active=True,
        )
        StudentProfile.objects.create(user=user, school_class=classes[class_key])

    def create_subjects(school_class, names):
        for name in names:
            subject = Subject.objects.create(
                school_class=school_class,
                name=name,
                block_count=2,
                start_date=START_DATE,
                due_date=DUE_DATE,
            )
            SubjectBlock.objects.create(subject=subject, index=1, label='Semester 1')
            SubjectBlock.objects.create(subject=subject, index=2, label='Semester 2')

    create_subjects(classes['5'], SUBJECTS_5)
    create_subjects(classes['8'], SUBJECTS_8)
    create_subjects(classes['pre'], SUBJECTS_PRE)


def unseed_data(apps, schema_editor):
    School = apps.get_model('academics', 'School')
    User = apps.get_model('accounts', 'User')

    # Cascades to Class -> Subject -> SubjectBlock.
    School.objects.filter(name='Школа').delete()
    # StudentProfile.school_class is SET_NULL, not CASCADE, so the seeded
    # users need deleting explicitly (cascades to their StudentProfile).
    User.objects.filter(email__in=[email for email, _, _ in STUDENTS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('academics', '0001_initial'),
        ('accounts', '0002_studentprofile_school_class'),
    ]

    operations = [
        migrations.RunPython(seed_data, unseed_data),
    ]
