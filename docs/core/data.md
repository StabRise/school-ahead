# Entity Relationships & Architecture

The following documentation outlines the top-down entity hierarchy and multi-tutor assignment structure within the **Ahead** platform.

---

## 1. Top-Down Entity Hierarchy

The system organizes academic data through a strictly nested, hierarchical structure:

* **School:** The highest-level container representing the organization or educational workspace.
* **Class:** The grouping of students by academic year.
    * **Attribute:** Flexible text-based naming convention supporting values such as `Pre1`, `Pre2`, `1`, `2`, and onwards.
* **Subject:** Academic disciplines tied to a specific class (e.g., *Mathematics for 2nd Grade*).
    * **Attributes:** Includes a description and recommended resources formatted in **Markdown**.
    * **Subject Blocks:** Subjects are divided into logical blocks (semesters or modules). By default, a subject is split into **2 blocks**, distributing lessons evenly (if the total lesson count is odd, the first block contains 1 extra lesson). The system also supports custom block counts, such as a single block or 4 quarters.
* **Topic:** Chapters or thematic modules nested within a subject.
* **Lesson:** The terminal learning elements (ranging from Lesson 1 to Lesson $N$). Each lesson contains the interactive lesson wizard, Markdown-based descriptions, study materials, activities, and its lifecycle status.

---

## 2. Multi-Tutor Architecture & Access Control

The platform accommodates a flexible multi-tutor environment where educators are assigned at a granular level:

* **Subject-Level Assignment:** Tutors are mapped directly to specific subjects rather than entire grade levels (e.g., one tutor handles Mathematics for both 5th and 6th grades, while another handles History exclusively for 7th grade).
* **Filtered Tutor Dashboard:** This explicit mapping ensures that each tutor's dashboard displays **only** the feed of submissions, inquiries, and backlogs ("tails") for their assigned subjects, completely filtering out irrelevant noise.