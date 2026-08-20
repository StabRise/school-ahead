Academic Dates and Schedule Planning
1. General Overview
   This module manages academic periods (Subject, SubjectBlock), topics (Topics), and the automated generation of the weekly calendar (Weekly Calendar) for students and tutors in the Ahead project.

2.1. Start Date (start_date)
Default Value: September 1st of the current academic year.

Manual Control: Tutors or administrators can manually modify start_date through the subject details admin page.

2.2. Due Date (due_date)
Default Value: Calculated as start_date plus 9 months.

Manual Control / Override: Tutors have full flexibility to manually set due_date to any desired date at any time (without rigid restrictions or artificial limits).

Core Validation Rule (Guardrail): The start date (start_date) must always be strictly earlier than the due date (due_date).

3.1. Manual Topic Order Management
Order Customization: Tutors can manually change the order of topics (Topics) within a subject (e.g., via drag-and-drop or priority indices).

Impact on Calculation: The updated topic order directly determines which specific topics are distributed across weeks during the next calendar generation.

3.2. Weekly Calendar Generation
Trigger: The calendar is not generated automatically in the background—creation occurs exclusively via a button click in the subject details admin page.

Topic Sequence: During generation, the system takes topics strictly in their current manual order and distributes them across weeks within the range between start_date and due_date.

3.3. Manual Lesson Rescheduling
Tutor Capabilities: Despite the automated distribution of topics via the button, tutors can at any time manually move individual lessons to specific weeks.

Forced Recalculation: Tutors can update academic dates (start_date / due_date) or topic order and initiate a forced calendar recalculation (force calendar recalculation).