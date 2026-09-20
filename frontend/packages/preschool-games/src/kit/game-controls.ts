// Where a game's round controls sit: one row along the page's top-left corner,
// fixed to the viewport like the 🏠 (kit/home-button.tsx, `fixed left-4
// top-20` — below the app's own header), so every game has them in the same
// place, next to the 🏠, whatever the play frame around the game is doing. The
// buttons are 36px with 8px between them: 🏠, then ⚙️, then the music toggle.
//
// A student in preschool mode has no site header, so for them the row moves up
// to the top of the screen (16px) — the app marks the page `<html
// data-headerless>` (apps/web components/preschool/chrome.tsx) and the
// `[html[data-headerless]_&]:` variants below take over.
//
// Full class strings, not built from pieces, so Tailwind's source scan finds
// them.
export const GAME_SETTINGS_BUTTON_POSITION = "fixed left-15 top-20 z-10 [html[data-headerless]_&]:top-4";
export const GAME_MUSIC_BUTTON_POSITION = "fixed left-26 top-20 z-10 [html[data-headerless]_&]:top-4";
// The ⚙️'s floating panel, just under the row.
export const GAME_SETTINGS_PANEL_POSITION = "fixed left-15 top-32 z-10 [html[data-headerless]_&]:top-16";
// The row's other members (the 🏠 itself, the stories game's 📚 and music).
export const GAME_ROW_TOP = "top-20 [html[data-headerless]_&]:top-4";
