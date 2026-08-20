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
* **Action Trigger:** Clicking a node launches the lesson workspace directly.
If today all lessons are completed, it triggers delightful game 2 минуты (воздушные шары спускаются, а когда ученик нажимает на них мышкой они лопаются и издают прикольныйй звук и исчезают) 
ведется счетчик, который показывает сколько всего шариков лопнул ученик.