# Entity Relationships & Architecture

The following documentation outlines the top-down entity hierarchy and multi-tutor assignment structure within the **Ahead** platform.

---

## 1. Top-Down Entity Hierarchy

The system organizes academic data through a strictly nested, hierarchical structure:

* **School:** The highest-level container representing the organization or educational workspace (`backend/academics/models.py`'s `School` — also holds `locale_default` and `timezone`, though the latter isn't enforced anywhere in scheduling logic yet, see `docs/architecture/07-open-questions.md`).
* **Class:** The grouping of students by academic year (`Class`).
    * **Attribute:** Flexible text-based naming convention supporting values such as `Pre1`, `Pre2`, `1`, `2`, and onwards, plus `academic_year` and an optional homeroom `class_teacher`.
* **Subject:** Academic disciplines tied to a specific class (e.g., *Mathematics for 2nd Grade*).
    * **Attributes:** Includes a description and recommended resources formatted in **Markdown**, plus an `AttestationType` (none / test / exam / project) and an optional `SubjectGroup` — an optional curriculum track a subject can belong to (e.g. a homeschooled student attesting under both a Ukrainian and a Polish curriculum, each with its own subject set).
    * **Subject Blocks:** Subjects are divided into logical blocks (semesters or modules) via `Subject.block_count`, defaulting to **2**. `academics.services.assign_topics_to_blocks` distributes the subject's `Topic`s evenly across that many `SubjectBlock`s (remainder going to the first blocks), which every `Lesson` under that Topic inherits — see `docs/architecture/01-backend-apps.md`. The system also supports custom block counts, such as a single block or 4 quarters.
* **Topic:** Chapters or thematic modules nested within a subject, ordered by tutor-editable `order_index` (see `docs/core/schedule_planning.md`).
* **Lesson:** The terminal learning elements (ranging from Lesson 1 to Lesson $N$). Each lesson contains the interactive lesson wizard, Markdown-based descriptions, study materials, activities, and its lifecycle status (see `docs/core/lessons.md`).

---

## 2. Multi-Tutor Architecture & Access Control

The platform accommodates a flexible multi-tutor environment where educators are assigned at a granular level:

* **Subject-Level Assignment:** Tutors are mapped directly to specific subjects rather than entire grade levels (e.g., one tutor handles Mathematics for both 5th and 6th grades, while another handles History exclusively for 7th grade).
* **Filtered Tutor Dashboard:** This explicit mapping ensures that each tutor's dashboard displays **only** the feed of submissions, inquiries, and backlogs ("tails") for their assigned subjects, completely filtering out irrelevant noise.