# Preschool View & "My Today's Lessons" Game Map

## 1. Overview & User Preference Management
* **Dual-View Architecture:** The Ahead platform supports two distinct student interface modes:
    * **Default View:** Standard academic layout for older students (calendar grids, structured tables).
    * **Preschool View (`preschool`):** A gamified, highly visual, and engaging interface tailored for young children.
* Preference Persistence:** Students (or parents managing their accounts) can toggle between views via a settings 
switch. The selected preference is automatically saved to the student's profile backend model, ensuring the chosen 
layout persists across sessions and devices.

---

## 2. "My Today's Lessons" Page — Preschool Game Map (`/`)
When a student with the active `preschool` preference logs in or navigates to the root dashboard (`/`), 
they are greeted by an interactive, game-like adventure map.

### 2.1. Visual Design & Theme
* **Aesthetic:** Colourful, whimsical, and playful vector illustrations (e.g., friendly animal guides, floating clouds, bright stars, and vibrant paths).
* **Core Metaphor (The Adventure Road):** Lessons are represented as sequential steps or milestones along a winding magical road.

### 2.2. Scope Rules
need to make unactive steps-lessons, which are already completed.

### 2.3. Interactive Elements & Mechanics
* **Step Nodes:** Each node on the road represents an lesson, featuring:
    * A cute icon: take it from lesson icon (add img field) if empty from subject icon (add img field), if empty from cute default icon.
    * A friendly,  lesson title.
* **Action Trigger:** Clicking a node launches the lesson  directly.

### 2.4. Celebration Event & Balloon Pop Minigame (All Lessons Completed)
When all scheduled lessons for the day reach the **`Completed`** state, the adventure map dynamically transitions into a celebratory reward minigame designed to reinforce positive reinforcement and make finishing daily tasks fun.

* **Trigger Condition:** Evaluated on dashboard load when all todays lessons are completed.
* **Minigame Mechanics ("Balloon Pop"):**
    * Colorful balloons slowly drift down across the screen from top to bottom.
    * When the student clicks a balloon with their mouse or tap device, it instantly pops with a playful sound effect and disappears with a particle burst animation.
    * **Score Tracker:** A friendly, floating counter tracks how many total balloons the student has popped during the celebration session, encouraging playful interaction and rewarding their hard work.
  