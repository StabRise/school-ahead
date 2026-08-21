# Avatar Customization & Home Decoration System

## 1. Overview & Objectives
To increase user engagement and retention, we are introducing a **Profile Avatar Customization** and **Virtual House Decoration** system. Users can select an initial character companion, use earned platform currency (Diamonds) to purchase clothing, accessories, and home items, and personalize their virtual space.

---

## 2. Core Functional Requirements

### 2.1. Character Selection & Management
* **Initial Selection:**
* On the Student Profile page, the user can choose their core companion character from available unlocked options (e.g., Raccoon, Fox, Unicorn, etc.).
* **Profile Integration:**
* The selected character acts as the user's primary avatar across the dashboard (is on the road in Today Lessons Page), lesson clearing screens, and leaderboards.
* **Storage & State:**
* The database must store the user's currently equipped avatar ID, unlocked avatars array, and equipped cosmetic slots.

### 2.2. Avatar Wardrobe & Customization Shop
* **Customization Slots:**
* Support for interchangeable accessory categories (e.g., Hats/Headwear, Eyewear, Outfits/Costumes, Special Items).
* **Currency Integration (Diamonds):**
* Items in the shop have a fixed Diamond price.
* Attempting to purchase an item triggers a balance check:
* *If balance $\ge$ price:* Deduct Diamonds, unlock the item, and add it to the user's inventory.
* *If balance $<$ price:* Display a friendly modal prompting the user to complete more lessons to earn Diamonds.
* **Equip/Unequip Logic:**
* Real-time preview of items on the character sprite before saving changes.

### 2.3. Virtual Home Decoration System
* **House Room View:**
* A dedicated UI screen representing the character's cozy room/house.
* **Interactive Slots / Furniture Categories:**
* Support for placement slots (e.g., Wallpaper, Flooring, Bed/Furniture, Rugs, Wall Decals, Window Views).
* **Decoration Shop:**
* Similar to the avatar shop, users can spend Diamonds to purchase home decor items and place them in their room layout.
