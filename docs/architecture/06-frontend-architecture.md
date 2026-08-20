# Frontend Architecture

Next.js App Router structure and the client-side state/data conventions. The frontend calls Django **directly** via the Orval-generated client — there is no BFF/proxy layer in Next.js. The generated client is used from both sides of Next.js: Client Components use its React Query hooks (cookie-authenticated), and Server Components/Route Handlers/Server Actions call the same client with a server-side mutator (Bearer-authenticated, same JWT) — see `05-auth-flow.md` for the full mechanics.

## Route structure

`[locale]` segment for next-intl (`uk` is the default locale per `docs/core/languages.md`, but no string may be hardcoded — see that doc's i18n-readiness note). Role-scoped route groups keep student/tutor/parent navigation separate without affecting the URL path.

```
frontend/app/[locale]/(auth)/login/page.tsx
frontend/app/[locale]/(student)/calendar/page.tsx
frontend/app/[locale]/(student)/today/page.tsx
frontend/app/[locale]/(student)/subjects/[subjectId]/progress/page.tsx
frontend/app/[locale]/(student)/lessons/[studentLessonId]/page.tsx   # wizard
frontend/app/[locale]/(tutor)/dashboard/page.tsx                      # Need Help + Pending Review columns
frontend/app/[locale]/(tutor)/submissions/[studentLessonId]/page.tsx
frontend/app/[locale]/(parent)/overview/page.tsx                      # minimal, per 07-open-questions.md
```

No `app/api/*` route handlers — every API call, including auth (Google login, refresh, logout), goes straight from the browser to Django through Orval-generated hooks.

## Orval client design

Orval's generated client `baseURL` is Django's origin, read from `NEXT_PUBLIC_API_URL` (e.g. `https://api.school-ahead.com` in production, `http://localhost:8000` in dev). Orval's `mutator` config option points at **two** mutator implementations, selected by where the generated hook/function actually runs:

**Browser mutator** (Client Components):
- Sets `withCredentials: true` (Axios) / `credentials: 'include'` (fetch) on every request so the browser sends/accepts the httpOnly auth cookies cross-origin.
- Reads the JS-readable `csrf_token` cookie and attaches it as an `X-CSRF-Token` header on every mutating request (`POST`/`PATCH`/`DELETE`) — see `05-auth-flow.md`'s CSRF section.
- A response interceptor catches a `401`, calls `POST /api/auth/refresh` once (also `credentials: include`), and retries the original request (`05-auth-flow.md`, Diagram C).

**Server mutator** (Server Components / Route Handlers / Server Actions):
- Reads the `access_token` cookie value via `next/headers`'s `cookies()` off the incoming request and sets `Authorization: Bearer <access_token>` — no `credentials`/cookie-forwarding involved, and no CSRF header needed (`05-auth-flow.md`, Diagram E).
- Cannot transparently refresh from a plain Server Component render (Next.js can't set cookies there); a Server Action or Route Handler using this same mutator can run the refresh flow itself when it needs to, since those *can* write cookies (`05-auth-flow.md`).

Both mutators call the same Django origin directly — there's no proxy in between. `CORS_ALLOWED_ORIGINS`/`CORS_ALLOW_CREDENTIALS` must be configured on Django for the frontend's origin (`04-api-design.md`), and the deployment topology must put frontend and backend on the same parent domain, with Django's auth cookies set to that shared parent `Domain` (not host-only) — required both for `SameSite=Lax` (browser mutator) and for the browser to hand the cookie to Next.js's own server at all (so the server mutator has something to read) — see `05-auth-flow.md`.

## Zustand store boundaries

Client-only ephemeral state — **never** a cache for server data:

- **`useAuthStore`**: user id/role/name/locale/avatar only (never tokens), hydrated from the Orval-generated `GET /api/auth/me` hook (called directly against Django) on load.
- **`useLessonWizardStore`**: per-lesson ephemeral step index, draft answers/file, dirty flag — scoped/reset by `studentLessonId`.
- **`useUIStore`** (optional): modal/toast/sidebar state.

## React Query conventions

Orval generates hooks from Django Ninja's exported OpenAPI schema. All server data — schedule, progress, dashboard feeds, lesson content — lives in React Query, never duplicated into Zustand. Mutation success handlers invalidate the relevant query keys: submitting a lesson invalidates `today`, `calendar`, and `subject-progress`. The tutor Need-Help feed uses `refetchInterval` polling (see `04-api-design.md`'s real-time-delivery note).

Pages that want an authenticated initial render (e.g. `/today`, `/calendar`, the tutor dashboard) call the Orval-generated function directly in the Server Component using the server mutator, then pass the result into React Query as prefetched/hydrated initial data for the corresponding Client Component — standard Next.js App Router server-prefetch-then-hydrate, using the same generated function either side, just a different mutator underneath (`05-auth-flow.md`, Diagram E).

## Component organization

shadcn/ui components generated into `frontend/components/ui/`, composed into feature components under `frontend/components/<domain>/` (e.g. `components/lesson-wizard/`, `components/tutor-dashboard/`), using Radix primitives underneath per shadcn convention. Forms use React Hook Form + Zod resolvers.

## Lesson wizard state

The wizard's step index, draft answers, and dirty flag live in `useLessonWizardStore`, keyed by `studentLessonId` so switching lessons resets cleanly. Submitting a step (start / submit-quiz / confirm-understanding / submit-task / request-help / resubmit) is a React Query mutation against the corresponding `lessons` endpoint (`04-api-design.md`); on success, the store's step index advances and the relevant queries are invalidated.

---
[← Back to Overview](00-overview.md)
