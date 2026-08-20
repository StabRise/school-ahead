# Functional Specification: Weekly Calendar (Student Main Screen)

## 1. Overview
The Weekly Calendar serves as the primary dashboard for students on the Ahead platform. It provides a comprehensive, time-oriented view of the student's academic schedule, balancing active daily planning with robust backlog management to ensure continuity and prevent academic debt accumulation ("tails").

---

## 2. Screen Layout & Core Components

### 2.1. Header & Navigation Toolbar
* **Week Selector:** Displays the current active date range (e.g., *Oct 2 – Oct 8, 2026*).
* **Navigation Controls:**
    * "Previous Week" and "Next Week" arrow buttons to browse historical records or future assignments.
    * "Today" quick-jump button to instantly re-center the calendar on the current week.
* **Progress Summary Bar:** A compact visual indicator displaying the proportion of completed lessons versus total scheduled lessons for the active week.

### 2.2. Weekly Grid (Days of the Week)
* **Structure:** A responsive multi-column layout representing the active week from Monday through Sunday.
* **Day Columns:** Each column corresponds to a specific calendar day, displaying its date and day name.
* **Lesson Cards:** Individual lessons scheduled for a given day are rendered as interactive cards inside the respective column.
* **Card Details & Indicators:**
    * Subject name and lesson title.
    * Time or order index.
    * Current status badge (color-coded for *Assigned*, *In Progress*, *Need Help*, *Pending Review*, or *Completed*).
    * Direct click-through action to open the lesson workspace.

### 2.3. Backlog Block ("Tails" Prevention Section)
* **Purpose:** A dedicated, persistent interface panel located alongside or above the weekly grid designed to capture incomplete past work.
* **Automatic Transfer Mechanism:** If a lesson passes its scheduled date without reaching a *Completed* state, the system automatically migrates it into the Backlog block.
* **Visual Representation:** Backlog items display their original scheduled date indicators (e.g., *Mon #4*, *Tue #2*) to preserve context.
* **Flexibility & Catch-Up:** Students can access these items at any time to clear academic backlogs without disrupting their current weekly schedule flow.

---

## 3. User Interactions & Behavioral Rules
1. **Week Switching:** Changing the week updates the grid content dynamically via asynchronous requests, displaying the corresponding lessons for that timeframe.
2. **Opening a Lesson:** Clicking a lesson card (either from the weekly grid or the backlog block) redirects the student to the lesson execution screen and triggers the automatic backend state transition to *In Progress* (if previously *Assigned*).