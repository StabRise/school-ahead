// Where a game's round controls sit: one row along the page's top-left corner,
// fixed to the viewport like the 🏠 (kit/home-button.tsx, `fixed left-4
// top-20` — below the app's own header), so every game has them in the same
// place, next to the 🏠, whatever the play frame around the game is doing. The
// buttons are 36px with 8px between them: 🏠, then ⚙️, then the music toggle.
//
// Full class strings, not built from pieces, so Tailwind's source scan finds
// them.
export const GAME_SETTINGS_BUTTON_POSITION = "fixed left-15 top-20 z-10";
export const GAME_MUSIC_BUTTON_POSITION = "fixed left-26 top-20 z-10";
// The ⚙️'s floating panel, just under the row.
export const GAME_SETTINGS_PANEL_POSITION = "fixed left-15 top-32 z-10";
