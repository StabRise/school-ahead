# Lesson Screen Structure

Documents what's actually built, as of this writing — the original spec
described a strictly sequential, page-by-page wizard ("penultimate page",
"final page"). What shipped is a **tab switcher** over the same content;
a student can jump between sections freely rather than paging through them
in order.

## 1. Where it lives

`/lessons/{id}` → `StudentLessonView`
(`components/lesson-wizard/student-lesson-view.tsx`) → `LessonWizard`
(`components/lesson-wizard/lesson-wizard.tsx`) outside preschool mode;
preschool mode gets its own fullscreen `PreschoolLessonView` instead (a
genuinely two-step flow — see `docs/views/preschool/README.md` §4).

## 2. The tab switcher (`StepSwitcher`, `components/lesson-wizard/step-switcher.tsx`)

Rendered directly under the lesson title. There's no breadcrumb encoding
the current step anymore — this tab bar is the only navigation. Tabs,
`WizardStep` values in parens:

| Tab | Value | Content |
|---|---|---|
| Теорія | `materials` | `LessonOut.materials` — the tutor-authored `LessonAttachment`s + lesson content. |
| Читання | `readingMaterials` | A **distinct**, student-curated concept (`backend/lessons/models.py`'s `StudentLessonMaterial`) — not the same as the Теорія tab despite the similar name. |
| Assessment | `assessment` | Icon/label depend on `lesson_type`: a checklist + "Тест" for `with_quiz`, a clipboard for `with_task`, a checkmark + "everything clear?" confirmation for `theory`. This is where the three grading paths from `docs/core/lessons.md` actually live. |
| Коментарі | `comments` | Free-form comment thread, open at any status. |
| Пояснення | `explanation` | Only shown once a `help_request` has ever been raised on this `StudentLesson` — absent for most lessons. Surfaces the Need-Help thread (`explanation-thread.tsx`). |

## 3. Assessment tab by lesson type

* **`with_quiz`** → `quiz-step.tsx`: multiple-choice questions,
  auto-graded on submit.
* **`with_task`** → `task-step.tsx`: file/photo upload + comment,
  transitions the lesson to `Pending Review` on submit.
* **`theory`** → `theory-step.tsx`: the "Чи все зрозуміло?" (Do you
  understand everything?) confirmation — Yes completes the lesson, No
  raises a Need-Help request.

See `docs/core/lessons.md` for the full status state machine these three
paths drive.

## 4. Need-Help

A persistent `need-help-button.tsx` is available regardless of which tab
is open, not just from a specific "final page." Raising one is what makes
the Пояснення tab appear; `resolve-need-help-button.tsx` lets the student
mark it resolved, reverting the lesson to `In Progress`.
