# Task Description: Responsive "My Subjects" Section for Student Dashboard

## Objective
Implement a fully responsive and interactive **"My Subjects"** section on the student's dashboard, displaying a dynamic grid of subject cards that adapt to various screen sizes.

---

## Key Requirements & Specifications

### 1. Layout & Structure
* **Card Design:** Each subject is represented by an individual card containing:
  * A distinct colored icon/marker representing the subject.
  * Subject title (e.g., Mathematics, Physics).
  * Teacher's name.
  * Progress bar with completion percentage.
  * A status badge / action pill indicating current tasks or lessons (e.g., "Lesson #24 today").
* **Interactivity:** **The entire card must be clickable.** Clicking anywhere within the card container should redirect the student to the detailed view of that specific subject.

### 2. Responsive Breakpoints & Behavior
The layout must dynamically adjust based on screen width:

* **Desktop / Large Screens (1024px and above):**
  * Grid layout: **3 or 4 columns** in a row.
  * Full display of all information elements (icon, title, teacher, progress bar, status badge).

* **Tablets (768px to 1023px):**
  * Grid layout: **2 columns** in a row.
  * Compact padding and optimized spacing to fit portrait and landscape orientations without clutter.

* **Mobile Devices (Under 767px):**
  * Grid layout: **1 single column** (vertical stack).
  * Cards stretch to full screen width.
  * Optimized vertical space (secondary info like the teacher's name may be streamlined or minimized, keeping the **Title**, **Progress**, and **Status Badge** prominent).
  * Touch-friendly hit targets for the entire card.

---

## Acceptance Criteria
* [ ] The "My Subjects" section renders correctly across desktop, tablet, and mobile breakpoints.
* [ ] The entire card functions as a single clickable link/button.
* [ ] Subject data correctly displays the title, teacher, progress bar, and status badge.
* [ ] Visual styles match the design specifications (rounded corners, shadows, color-coded icons).
