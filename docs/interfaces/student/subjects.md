# Task Specification: Subject Details & Topic Workspace Implementation

## 1. User Story & Objective
As a student, I want to click on any subject in my subjects list (`/uk/subjects`) to navigate to its dedicated detail page. This page should cleanly organize the subject's metadata, resources, and curriculum into tabs—including a subject-level completion progress tracker—allowing me to select specific topics, view their details on a dedicated sub-page, and check a paginated list of lessons with their statuses and scores.

---

## 2. Requirements Breakdown

### A. Navigation & Routing
* **Source View:** `http://localhost:3000/uk/subjects` (Subject List).
* **Action:** Wrap each subject card or name in an interactive link.
* **Destination Route:** `http://localhost:3000/uk/subjects/[subjectId]`
* **Topic Route:** Clicking a specific topic inside the subject's topics tab navigates to a dedicated page: `http://localhost:3000/uk/subjects/[subjectId]/topics/[topicId]`

### B. Subject Detail Page Layout (Tabs)
The subject detail workspace must implement a tabbed interface (e.g., using Radix UI Tabs or Shadcn components) to segment information effectively:

* **Tab 1: Overview / Info**
    * Displays the subject `name` as a primary heading.
    * **Progress Indicator:** A visual progress bar and percentage value representing the `% of completed` lessons for that specific subject.
    * Renders the subject `description`.
* **Tab 2: Recommended Resources**
    * Renders the `recommended_resources` field (supporting markdown or rich text block formatting).
* **Tab 3: Topics**
    * Displays the list of curriculum topics belonging to this subject, with each item acting as a navigational link to its respective topic details page.

### C. Topic Details & Lesson Workspace (Dedicated Page)
When navigating to a specific topic page (`/uk/subjects/[subjectId]/topics/[topicId]`), the view must render:

* **Topic Header:** Topic `name` and `description`.
* **Progress Indicator:** A visual progress bar and percentage value representing `% of completed` lessons for that specific topic.
* **Paginated Lessons Table:** A clean, structured data table containing:
    * **Lesson Name (`name`):** Clickable link redirecting to the lesson execution workspace.
    * **Status (`status`):** Visual badge indicating current state (*Assigned*, *In Progress*, *Need Help*, *Pending Review*, *Completed*).
    * **Score (`score`):** Displaying earned points (e.g., *12/12*) or a pass/fail indicator (or a dash `—` if unearned/not graded yet).
    * **Pagination Controls:** Standard table pagination handling large lists of lessons per topic seamlessly.