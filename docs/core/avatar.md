# Avatar Customization & Home Decoration System

Documents what's actually built, as of this writing (same convention as
`docs/core/progress.md`/`gamification.md`). This doc's original spec
described one combined system (companion + wardrobe shop + home
decoration); what shipped is two separate features sharing only the
Diamond currency — the avatar/wardrobe system below (`backend/accounts`),
and a distinct 3D room/furniture system (`backend/house`, see §4).

## 1. Companion character (`Avatar`)

`Avatar` (`backend/accounts/models.py`) is a selectable body — `key`,
`name`, an SVG `image`, and a `scale` tuned per-avatar so a body lines up
with its wardrobe without re-authoring the art. `GET /auth/avatars` lists
every active one; every avatar is available to every student today (no
per-avatar unlock/price — only wardrobe *items* are priced, see §2).

- **Equip**: `PATCH /auth/me/avatar` (`avatar_id`, or `null` to unequip
  entirely — the header then falls back to the Google account picture, or
  initials). Switching avatars clears all three equipped-wardrobe sets,
  since a previous avatar's clothing doesn't fit a different body — but
  purchased items stay in `unlocked_items` and are equippable again on
  switching back.
- **Display**: `equipped_avatar` renders as the bottom layer with equipped
  `AvatarItem`s stacked on top (clothing → headwear → accessory) — the
  student's primary avatar across the dashboard, lesson-clearing screens,
  and the header. Not yet wired into the preschool mascot — see
  `docs/views/preschool/README.md` §7 (the `Raccoon` mascot there is
  hard-coded regardless of what a student has equipped). No leaderboards
  exist yet at all.

## 2. Wardrobe (`AvatarItem`)

`AvatarItem` — a wardrobe piece for one `Avatar`, in one of three slots
(`AvatarItemSlot`: `clothing` / `headwear` / `accessory`), each many-to-many
so several pieces can be worn per slot at once (e.g. socks under pants
under a jacket), stacked by `layer_order`. Per-item `scale`/`offset_x`/
`offset_y` let the tutor avatar editor line an item up with its avatar's
body without re-authoring the SVG.

- **Equip/unequip**: `PATCH /auth/me/avatar-items` — always sends the full
  wardrobe state for all three slots; every item must already be unlocked.
- **Global stacking order**: `PATCH /auth/me/avatar-items/order` — a
  separate concern from equip/unequip, reordering currently-equipped items
  across all slots at once (`EquippedItemOrder`).
- **Per-student placement override**: `PATCH`/`DELETE
  /auth/me/avatar-items/{id}/placement` — a student can click one of their
  own equipped items on the avatar preview and drag/rotate/resize it
  (`EquippedItemPlacement`); purely cosmetic and private to that student,
  never shown to any other viewer; `DELETE` resets to the tutor-configured
  default.
- **Purchase** (`POST /auth/me/avatar-items/{id}/purchase`, wired through
  `accounts.services.purchase_avatar_item`): a single conditional `UPDATE`
  (`diamond_balance_cache__gte=item.price`) so two concurrent purchases
  can't both succeed off a stale balance. `price=0` items are free and
  never need a purchase row. Unlocks are recorded on
  `StudentProfile.unlocked_items` (independent of `equipped_*`, so
  switching avatars and back never loses access to anything already
  bought). See `docs/core/gamification.md` §4 for the full spend-flow
  detail (confirm-purchase dialog, `NotEnoughDiamondsDialog`).

## 3. Frontend

`@school-ahead/avatar` (`frontend/packages/avatar/`) owns the picker, the
layered SVG preview/editor (equip, reorder, placement drag), the
purchase/diamond-check dialogs, a preschool-specific wardrobe variant, and
the tutor-facing avatar/wardrobe-art editor. `frontend/apps/web/app/` wires
this into the `/profile` page (`AvatarPicker`/wardrobe) and the tutor
`avatars` route (catalog authoring).

## 4. Home decoration — a separate system (`house` app)

The original spec described home decoration as part of this same system
("Virtual House Decoration"); what actually shipped is `backend/house`, a
distinct, fully-built 3D room/furniture app (three.js via
`@school-ahead/house-3d`, `@react-three/fiber`) — not a sub-feature of the
avatar/wardrobe system above, sharing only the Diamond currency.

- **Catalog**: `FurnitureItem` — a `.obj`/`.stl` 3D model + optional
  `.mtl` material + `FurnitureTexture` images, a 2D `thumbnail_image` for
  the shop grid, a Diamond `price`, and a `surface` (`floor` / `wall` /
  `ceiling`) that drives snap-to-surface placement in the 3D scene.
- **Ownership**: `FurniturePurchase` — a dedicated ledger row per bought
  item (free items need none), separate from `accounts.StudentProfile`
  entirely so `house` owns its tables end to end.
- **Placement**: `PlacedFurnitureItem` — full free 3D placement (position
  + rotation on all three axes + scale), defaulting to the catalog's
  `default_position_*`/`default_rotation_*`/`default_scale` on purchase,
  then draggable via a `TransformControls` gizmo; "put away" deletes the
  row.
- **Room styling**: `RoomStyle` — one implicit room per student (no `Room`
  catalog/model — every student gets exactly one), a `wall_color`/
  `floor_color` hex pair, created lazily on first read/style rather than
  backfilled.
- **API**: `GET /house/furniture` (catalog with ownership/placement
  state), `POST .../purchase`, `POST .../place`, `PATCH`/`DELETE
  .../placement`, `GET`/`PATCH /house/room-style`.

## 5. Not built

- **Per-avatar unlock/pricing** — every `Avatar` body is available to
  every student today; only wardrobe items and furniture are priced.
- **Leaderboards** — mentioned in the original spec as a place the avatar
  shows up; don't exist.
- **Preschool mascot tied to the equipped avatar** — see §1.
