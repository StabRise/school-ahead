# Open Questions

Gaps and assumptions this architecture makes beyond what `/docs` specifies. Each item here is a stated assumption, not a confirmed product rule — revisit before or during implementation of the affected area.

- **Parent features.** `/docs` only names "debt tracking" and "automated reporting" as personas/future goals with zero field-level detail (`docs/core/core.md`). This design models only a minimal `ParentProfile` + `ParentStudentLink` for domain coherence — no Parent-facing API/UI beyond a stub route is designed.

- **Diamond formula.** No exact earning formula is documented for lesson completion, working ahead, or semester closure. `DiamondLedgerEntry.amount`/`reason` are pluggable; the actual point values are an open product decision.

- **Real-time delivery.** The tutor's Need-Help feed needs near-real-time visibility with no transport specified. This design defaults to React Query polling; WebSocket/SSE/Django Channels is a future upgrade path.

- **Multi-school / tenancy scope.** Unclear whether this is a single-tenant MVP or a multi-school SaaS from day one. `School` is FK-rooted throughout the data model, but tenant isolation/permissions beyond that FK aren't designed.

- **Quiz engine depth.** Only "multiple-choice quiz, >60% threshold" is specified. `QuizQuestion`/`QuizChoice` are intentionally minimal — no weighting, multi-select, or partial credit.

- **File storage backend.** Attachment/submission `FileField` storage (local disk vs. S3-compatible) isn't specified — a deployment-time decision, explicitly out of scope per the docker/CI exclusion for this pass.

- **Timezone handling.** `StudentLesson.scheduled_date` is a plain `DateField`; `School.timezone` exists but isn't enforced anywhere in scheduling logic yet — "today" boundary computation across timezones is unresolved.

- **Recalculation vs. manual overrides.** `docs/core/schedule_planning.md` doesn't say whether a "forced recalculation" is intended to also override lessons a tutor previously moved manually. This design defaults to *never* touching `is_manually_scheduled` or `completed` lessons during recalculation (`02-data-model.md`, decision 5) — an assumption, not a confirmed product rule.

- **New-student mid-year enrollment.** `docs/core/schedule_planning.md` doesn't say what happens to calendar generation when a student joins a class after a subject's calendar was already generated. This design doesn't specify a re-generation trigger for that case.

- **Deployment topology for cookie `SameSite`/`Domain`.** Removing the BFF (`05-auth-flow.md`) means the cookie strategy depends on frontend and Django sharing a parent domain (e.g. `app.school-ahead.com` / `api.school-ahead.com`), with `Domain=.school-ahead.com` set explicitly on the auth cookies. This is no longer just a `SameSite=Lax` nicety — it's a hard requirement for the Next.js-server-calls-Django path (Diagram E) to work at all, since that's how the browser hands the cookie to Next.js's own server in the first place. This is a deployment/DNS decision outside this pass's scope (docker/CI/deployment excluded) — if a shared parent domain can't be satisfied, both the `SameSite=Lax` convenience and the server-side call path break down; the fallback for `SameSite` alone is `SameSite=None; Secure` (HTTPS everywhere including local dev), but that does not restore the shared-`Domain` requirement for Diagram E.

- **Admin auto-assignment revocability.** Admins are auto-assigned as tutor of every subject by default (`02-data-model.md`, decision 7). It's not specified whether an admin should be able to remove themselves from a specific subject's tutor list (setting `TutorSubjectAssignment.is_active = False`) without the next `post_save` trigger silently re-creating or reactivating it. This design doesn't resolve that — the triggers as specified would need an explicit guard (e.g. only auto-create if no row exists at all, never flip `is_active` back to `True`) to make manual revocation stick, and that guard isn't nailed down yet.

- **Quiz low-score status is internally inconsistent in the source doc.** `docs/core/lessons.md`'s canonical numbered lifecycle lists six statuses with no `Failed`, but its appended "Grading System" section says a ≤60% score means "LessonStatus remains active (**or updates to Failed**)." This design resolves it by keeping six statuses and treating a low score as staying `InProgress` (see `03-lesson-lifecycle.md`) — an assumption resolving a doc self-contradiction, not a confirmed product rule.

---
[← Back to Overview](00-overview.md)
