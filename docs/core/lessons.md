Here is the updated professional technical documentation with "Task" officially renamed to "Lesson" across all definitions, states, and workflows for Ahead:

# Lesson Lifecycle and Statuses

Every lesson in the Ahead platform follows a strictly defined state machine, transitioning through various statuses based on the lesson type, student interaction, and tutor review.

1. Assigned (Default)
   Definition: The lesson has been automatically scheduled according to the curriculum, but the student has not yet started working on it.

Transition: Moving to the second page of the lesson wizard or clicking the "Start" button changes the status to In Progress.

2. In Progress
   Definition: The student has opened the learning material and is actively working on it. Depending on the lesson type, this status branches into three distinct workflows:

Path A (Auto-graded Test): The student completes a multiple-choice quiz.

If the score is >60%, the status automatically updates to Completed, and a grade (1–12 scale) is assigned.

If the score is below the threshold, the student can retake the test or trigger a help request.

Path B (Standard Theory / Reading Lesson): On the final page, the system prompts the question: "Do you understand everything?"

If the student selects "Yes", the status automatically changes to Completed, and a "Pass" (Залік) grade is recorded.

If the student selects "No", the status changes to Need Help.

Path C (Manual Submission / Practical Lesson): The student reaches the submission page, uploads their completed work (e.g., a file or a photo of a notebook), and submits it. The status automatically transitions to Pending Review, locking the lesson from further editing.

3. Need Help
   Definition: A flagged alert state for tutors and parents. The student marks the lesson with this status if they are stuck and require assistance.

Transition: The tutor reviews the query, provides guidance, and manually shifts the lesson back to In Progress (for the student to continue) or directly to Completed.

4. Pending Review
   Definition: The student has completed the practical assignment, uploaded the necessary files, and submitted it for evaluation. The lesson is locked and cannot be edited by the student.

Transition: The tutor reviews the submission and decides the next state:

Switches the status to Completed (assigning a grade of 1–12 or a "Pass").

Switches the status to Revision Required if errors are found.

5. Revision Required (Потрібно попрацювати над помилками)
   Definition: The tutor has identified mistakes or missing elements in the submitted work and returned it for fixes along with feedback.

Transition: The student works on the corrections, adds a comment or uploads an updated screenshot/file directly to the lesson, and manually resubmits it. This moves the lesson back to Pending Review.

6. Completed
   Definition: The final state of a successfully finalized lesson.

Outcome: The lesson is verified and credited, the final grade or pass status is locked, and the student's diamond balance is updated.


Ось професійний опис розділу «Система оцінювання» англійською мовою (з урахуванням попередньої заміни терміна task на lesson), який ідеально доповнить твою технічну документацію:

# Grading System
    Once a lesson transitions into the Completed status, the final result is recorded depending on the lesson's configuration and type:

 ## Lesson Structure and Content
    Multi-page Architecture: A lesson can consist of one or more pages within the wizard.

    Final Interaction: The completion logic depends on the specific type of lesson, which is defined at the end of the final page: quiz or posibility to upload a file and write the comment to that file.
    
    Comment: both tutor and student can write comment to the lesson.    

## Grading and Status Transition Logic
   The system supports three distinct evaluation paths. The transition of the LessonStatus depends on the selected LessonType.

### Path A: Auto-graded Test (Quiz)
Mechanism: The student completes a multiple-choice quiz.

Automated Logic:

Score > 60%: LessonStatus updates to Completed. A grade is assigned on a 1–12 scale based on the result.

Score ≤ 60%: LessonStatus remains active (or updates to Failed), allowing the student to either retake the test or trigger a "Help Request".

### Path B: Standard Theory / Reading Lesson
Mechanism: The final page presents a self-assessment question: "Do you understand everything?"

Automated Logic:

"Yes" selected: LessonStatus updates to Completed. A grade is recorded as "Pass".

"No" selected: LessonStatus updates to Need Help, signaling the tutor to intervene.

### Path C: Manual Submission / Practical Lesson
Mechanism: The student reaches the submission page, uploads materials (files, photos, etc.), and clicks "Submit".

Automated Logic:

Submission: LessonStatus transitions to Pending Review.

Locking: The lesson becomes read-only, preventing the student from further editing until the tutor reviews the submission.

### Tutor Review Workflow
   Selective Intervention: Only lessons following Path C (Manual Submission) inherently require tutor manual review.

Exception Cases: Tutor intervention is also triggered if a student explicitly requests help (e.g., via Path A retake requests or Path B "No" response).


# Core Domain Components
Template Content (`Lesson`): Stores static lesson data, multi-page materials, wizard configurations, and quiz questions.

Per-Student Instances (`StudentLesson`): Manages the dynamic execution state for individual students