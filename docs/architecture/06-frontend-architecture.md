# Frontend Architecture

Next.js App Router structure and the client-side state/data conventions. The frontend calls Django **directly** via the Orval-generated client — there is no BFF/proxy layer in Next.js for authenticated app data. The generated client is used from both sides of Next.js: Client Components use its React Query hooks (cookie-authenticated), and Server Components/Route Handlers/Server Actions call the same client with a server-side mutator (Bearer-authenticated, same JWT) — see `05-auth-flow.md` for the full mechanics. Separately, `frontend/apps/web/app/api/*` route handlers exist too, but they don't proxy Django — they serve local filesystem content for the preschool minigames (see below).

## Monorepo structure

`frontend` is a Bun workspace, not a single flat Next.js app:

- **`frontend/apps/web`** — the actual Next.js app (App Router). Its own components live under `frontend/apps/web/components/`, its own client-only state under `frontend/apps/web/stores/`.
- **`frontend/packages/*`** — shared packages, consumed via the workspace protocol (`@school-ahead/<name>`), each with its own `src/`, some with their own `stores/`:
  - **`api-client`** — the Orval-generated Django client (browser + server mutators — see below), `useAuthStore`, `map-user.ts` (Django `UserOut` → frontend auth-store shape). Also owns TTS: Piper voice list/settings (`piper-tts.ts`, `piper-voices.generated.ts`, `tts-voice-settings-store.ts`) and shared Zod schemas — broader than "just the API client."
  - **`avatar`** — the avatar customization system: character picker, wardrobe/shop, equip/try-on (`avatar-tryon-store.ts`), a tutor-facing artwork/placement editor for avatar items. Backs `docs/core/avatar.md`.
  - **`house-3d`** — the 3D room/furniture reward space: shop, purchase, room scene, furniture placement, room-style picker, `house-scene-store.ts`. Backs `docs/architecture/01-backend-apps.md`'s `house` app.
  - **`flashcards`** — the standalone "Cards" study-flashcards feature (subject/group/set picker, quiz, flip-card, print view, import) — distinct from the preschool "Картки" minigame in `preschool-games`. Its own `stores/` (topic, progress, language, print-format, quiz-results).
  - **`markdown-editor`** — shared rich-content editing/viewing: markdown editor + toolbar, PDF viewing (iframe and native viewer), YouTube embed. Used for lesson content authoring/display.
  - **`preschool-games`** — the preschool minigame suite: balloon pop, trains, reading (syllables), cards (syllable flashcards), stories, multiplication ("math"), cocktail, cars, jumping-frogs, plus shared `game-shell`/`game-choice`/`game-play-page` scaffolding and a per-game `stores/`. See `docs/views/preschool/README.md` and the translated docs under `docs/preschool/games/`.
  - **`preschool-ui`** — the preschool persona's shared chrome, reused across the dashboard/calendar/lesson-view *and* the minigames: `Raccoon` mascot, `ScreenFrame`, decorations, the adventure-road game map, the preschool calendar view, the diamond-flight reward animation (`diamond-reward-store.ts`), celebration scene, quiz UI.

## Route structure

`[locale]` segment for next-intl (`uk` is the default locale per `docs/core/languages.md`). Route groups: **`(auth)`**, **`(student)`**, **`(tutor)`** only — there is no `(parent)` group. `role: "parent"` exists in `useAuthStore`'s type, but no parent-facing routes or UI are built yet (matches `docs/architecture/07-open-questions.md`'s "Parent features" gap).

```
frontend/apps/web/app/[locale]/(auth)/login/page.tsx
frontend/apps/web/app/[locale]/(student)/calendar/page.tsx
frontend/apps/web/app/[locale]/(student)/subjects/page.tsx
frontend/apps/web/app/[locale]/(student)/subjects/[subjectId]/page.tsx
frontend/apps/web/app/[locale]/(student)/subjects/[subjectId]/topics/[topicId]/page.tsx
frontend/apps/web/app/[locale]/(student)/lessons/[studentLessonId]/page.tsx   # wizard
frontend/apps/web/app/[locale]/(student)/games/...                            # preschool minigames, public (see middleware.ts PUBLIC_PATHS)
frontend/apps/web/app/[locale]/(student)/house/page.tsx
frontend/apps/web/app/[locale]/(student)/dictionary/page.tsx
frontend/apps/web/app/[locale]/(student)/achievements/page.tsx
frontend/apps/web/app/[locale]/(tutor)/tutor/subjects/[subjectId]/page.tsx
frontend/apps/web/app/[locale]/(tutor)/tutor/submissions/[studentLessonId]/page.tsx
frontend/apps/web/app/[locale]/(tutor)/tutor/students/[studentId]/page.tsx
```

Student routes also include `tasks/[taskId]`, `profile`, `settings`, `read-along`, and a `lessons/preview/[lessonId]` route. Tutor routes also include `classes`, `avatars`, `furniture`, `stories`, `lessons/[lessonId]`.

## App-local API routes (`app/api/*`)

These are **not** a Django proxy — every one of them reads/writes the Next.js app's own local filesystem (`public/static/...`) to serve folder-driven content for the preschool minigames and study features, and every one is excluded from the locale/auth middleware (`middleware.ts`'s `/api` matcher), so they're reachable without a session:

| Route | Serves |
|---|---|
| `preschool-mode(s)` | Balloon-pop minigame mode list/content, from `public/static/balloon-game/` |
| `reading-game-mode(s)` | Reading (syllable) minigame's consonant levels, from `public/static/letters/` |
| `cards-game-mode(s)` | "Картки" minigame's consonant levels, from `public/static/syllables/` |
| `flashcard-groups`, `flashcard-sets`, `flashcard-set` | The "Cards" study-flashcards feature's subject/group/set picker and content, from `public/static/cards/` |
| `stories`, `story` | The "Казки" minigame's story list/content — merges folder-driven stories under `public/static/stories/` with tutor-authored `Story` rows fetched server-side from the backend's `preschool` app |
| `music-tracks` | Background-music track list for the minigames, from `public/static/music/` |
| `read-along/extract` | The one exception — server-side fetches and extracts readable content from an external article URL the student pastes into the read-along feature (avoids browser CORS); not local-content-driven |

This folder-driven design means adding a new balloon-game mode, reading-game consonant, or flashcard set is a filesystem change under `public/static/`, not a code change.

## `interfaceMode`: persona as a render branch, not a route

A student has one of three interface modes — `preschool`, `simple`, or the default (colorful) view — stored as `StudentProfile.interface_mode` on the backend and exposed on `useAuthStore((s) => s.user?.interfaceMode)` on the frontend (hydrated via `map-user.ts` from `GET /auth/me`). This is **not** a route segment: the same URLs (`/`, `/calendar`, `/subjects/[id]`, `/lessons/[id]`) render a completely different component tree depending on the mode, decided by a branch inside a shared wrapper component. `SubjectDetailPage` (`frontend/apps/web/components/subjects/subject-detail-page.tsx`) is the canonical example:

```tsx
export function SubjectDetailPage({ subjectId }: { subjectId: number }) {
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);
  if (interfaceMode === "preschool") {
    return <PreschoolSubjectDetailPage subjectId={subjectId} />;
  }
  return <SimpleSubjectDetailPage subjectId={subjectId} colorful={interfaceMode !== "simple"} />;
}
```

The same pattern repeats in `student-dashboard.tsx`, `calendar/student-calendar-view.tsx`, `lesson-wizard/student-lesson-view.tsx`, `header.tsx` (hides itself entirely for fullscreen preschool lesson routes), and `preschool/profile-view.tsx`. The mode is toggled from `settings/view-settings.tsx` and the header's `preschool-mode-toggle.tsx` via `PATCH /auth/me/interface-mode`. None of the three variants duplicate data-fetching — they reuse the same Orval hooks and just render different presentational components (mostly from `preschool-ui`/`preschool-games`/`avatar` for the preschool variant). Full behavioral detail per screen lives in `docs/views/preschool/README.md`, not here.

## Orval client design

Orval's generated client `baseURL` is Django's origin, read from `NEXT_PUBLIC_API_URL` (e.g. `https://api.school-ahead.com` in production, `http://localhost:8000` in dev). Orval's `mutator` config option points at **two** mutator implementations, selected by where the generated hook/function actually runs:

**Browser mutator** (Client Components):
- Sets `withCredentials: true` (Axios) / `credentials: 'include'` (fetch) on every request so the browser sends/accepts the httpOnly auth cookies cross-origin.
- Reads the JS-readable `csrf_token` cookie and attaches it as an `X-CSRF-Token` header on every mutating request (`POST`/`PATCH`/`DELETE`) — see `05-auth-flow.md`'s CSRF section.
- A response interceptor catches a `401`, calls the refresh endpoint once, and retries the original request.

**Server mutator** (Server Components / Route Handlers / Server Actions):
- Reads the `access_token` cookie value via `next/headers`'s `cookies()` off the incoming request and sets `Authorization: Bearer <access_token>` — no `credentials`/cookie-forwarding involved, and no CSRF header needed.
- Cannot transparently refresh from a plain Server Component render (Next.js can't set cookies there); a Server Action or Route Handler using this same mutator can run the refresh flow itself when it needs to, since those *can* write cookies.

Both mutators call the same Django origin directly — there's no proxy in between (the `app/api/*` routes above are a separate, unrelated concern — local content only). `CORS_ALLOWED_ORIGINS`/`CORS_ALLOW_CREDENTIALS` must be configured on Django for the frontend's origin (`04-api-design.md`), and the deployment topology must put frontend and backend on the same parent domain, with Django's auth cookies set to that shared parent `Domain` — see `05-auth-flow.md`.

## Zustand store boundaries

Client-only ephemeral state — **never** a cache for server data. There is no single small fixed set of stores; each feature package owns what it needs:

- **App-level** (`frontend/apps/web/stores/`): `simple-dashboard-store`, `subjects-grouped-view-store`, `subject-progress-view-store`, `synopsis-language-store` — small view-preference stores local to one screen each.
- **`api-client`**: `useAuthStore` (user id/role/name/locale/**interfaceMode** — never tokens, hydrated from `GET /auth/me`), `tts-voice-settings-store`.
- **`avatar`**: `avatar-tryon-store` (in-progress wardrobe selection before purchase/equip).
- **`house-3d`**: `house-scene-store` (room/placement editing state).
- **`preschool-ui`**: `diamond-reward-store` (the flying-diamond animation queue, `addFlight`).
- **`preschool-games`**: one store per minigame (`balloon-pop-game-store`, `trains-game-store`, `reading-game-store`, `cards-game-store`, `math-game-store`, `cocktail-game-store`, `cars-game-store`, `jumping-frogs-store`) plus a shared `game-music-store`.
- **`flashcards`**: one store per concern (`flashcard-topic-store`, `flashcard-progress-store`, `flashcard-language-store`, `flashcard-print-format-store`, `flashcard-quiz-results-store`).

The lesson wizard does **not** use a Zustand store — its step index, draft state, and dirty flag are plain `useState` local to `lesson-wizard.tsx`, scoped by component lifetime rather than a keyed global store.

## React Query conventions

Orval generates hooks from Django Ninja's exported OpenAPI schema. All server data — schedule, progress, dashboard feeds, lesson content — lives in React Query, never duplicated into Zustand. Mutation success handlers invalidate the relevant query keys: submitting a lesson invalidates `today`, `calendar`, and `subject-progress`. The tutor Need-Help feed uses `refetchInterval` polling (see `04-api-design.md`'s real-time-delivery note).

Pages that want an authenticated initial render (e.g. `/calendar`, the tutor dashboard) call the Orval-generated function directly in the Server Component using the server mutator, then pass the result into React Query as prefetched/hydrated initial data for the corresponding Client Component — standard Next.js App Router server-prefetch-then-hydrate, using the same generated function either side, just a different mutator underneath (`05-auth-flow.md`).

## Component organization

shadcn/ui components generated into `frontend/apps/web/components/ui/`, composed into feature components under `frontend/apps/web/components/<domain>/` (e.g. `components/lesson-wizard/`, `components/subjects/`, `components/preschool/`), using Radix primitives underneath per shadcn convention. Forms use React Hook Form + Zod resolvers. Cross-cutting/reusable UI that isn't app-specific lives in the shared packages above instead (`preschool-ui`, `avatar`, `house-3d`, `flashcards`, `markdown-editor`).

## Lesson wizard state

The wizard's step index, draft answers, and dirty flag are local `useState` in `lesson-wizard.tsx` (not a Zustand store — see above), naturally reset on remount when navigating between lessons. Submitting a step (start / submit-quiz / confirm-understanding / submit-task / request-help / resubmit) is a React Query mutation against the corresponding `lessons` endpoint (`04-api-design.md`); on success, the step index advances and the relevant queries are invalidated. The preschool persona uses its own parallel wizard-shaped component (`PreschoolLessonView`, see `docs/views/preschool/README.md` §4) rather than sharing this one.

---
[← Back to Overview](00-overview.md)
