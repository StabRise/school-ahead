# Gamification: Diamonds

Diamonds (💎) are the platform's single virtual currency — every way a
student earns them and everything they can spend them on, in one place.
Documents what's actually built, as of this writing (same convention as
`docs/core/progress.md` §2, which this doc supersedes as the canonical
diamond reference — that section still holds the full detail on lesson/
topic/semester earning and now links back here).

## 1. Earning

| Source | Amount | Where |
|---|---|---|
| Completing a lesson on/after `scheduled_date` | +1 | `lessons.services.mark_completed` → `_award_completion_diamonds` |
| Completing a lesson strictly before `scheduled_date` ("ahead") | +2 (instead of +1) | same |
| Completing every `Lesson` in a `Topic` | +5, once per (student, Topic) | `_award_topic_completion_diamonds`, guarded by the `TopicCompletionBonus` row |
| Completing every `Lesson` in a `Topic.subject_block` ("semester") | +10, once per (student, block) | `_award_semester_completion_diamonds`, guarded by the `SemesterCompletionBonus` row |
| Popping a balloon in the preschool Balloon Pop minigame | 1 ruby; every 30 rubies → +1 | `frontend/components/preschool/balloon-pop-game.tsx`, `POST /auth/me/balloon-pop-reward` |
| Tapping any flashcard on that minigame's "learning" screen (repeats included) | 1 ruby (counts toward the same 30-ruby milestone above) | `BalloonLearningCards`' `onCardLearned`, see `docs/preschool/games/balloon game/README.md` §4 |
| Passing the balloon game's bonus heart-balloon quiz (`> 60%`) | +1 | `POST /auth/me/balloon-quiz-reward`, see that doc §5 |

The four lesson-level rows all route through the single
`lessons.services.mark_completed` — auto-graded quiz pass, theory
"understood" confirmation, a tutor grading a Pending Review submission, or a
tutor resolving a Need Help request to Completed — so no completion path
can skip an award. Full detail (idempotency guards, edge cases) lives in
`docs/core/progress.md` §2.

The three balloon-game rows are session-only counters with no server-side
verification of balloons popped/cards tapped/quiz answers — the frontend
calls the reward endpoint once per milestone/pass, on trust. Documented in
full in `docs/preschool/games/balloon game/README.md`.

## 2. Storage

`StudentProfile.diamond_balance_cache` — a single running integer,
incremented with an atomic `F()` update wherever diamonds are awarded (safe
under concurrent requests for the same student). Not an append-only ledger
— see the gap note in `docs/core/progress.md` §2 for what that costs
(no audit trail, no claw-back on a downgraded grade, no per-subject
breakdown). `TopicCompletionBonus`/`SemesterCompletionBonus` are the only
per-award records that exist, and only as idempotency guards for those two
bonuses specifically, not a general ledger.

## 3. Display & animation

* **Balance:** the app header shows a 💎 badge with the current balance
  next to the student's avatar (`components/header.tsx`'s `DiamondBadge`,
  marked `data-diamond-badge`), sourced from `UserOut.diamond_balance`
  (`GET /auth/me`) — `role=student` only, `null` for every other role.
* **Reward animation:** a 💎 (labeled "+N" for a multi-diamond reward, e.g.
  a lesson that also closed its topic) flies from wherever the reward was
  triggered to that header badge, via `components/flying-diamond.tsx` +
  `stores/diamond-reward-store.ts` (`useDiamondRewardStore.addFlight`).
  That store is a simple flight queue rendered once by
  `components/diamond-reward-overlay.tsx`, mounted in
  `app/[locale]/layout.tsx` alongside `<Header/>` — so a flight renders
  regardless of which page/component triggered it, and even when the
  header itself is hidden (the fullscreen preschool lesson view; the flight
  target then falls back to a fixed top-right point instead of the actual
  badge).
* **Who sees it:** the lesson wizard's theory/quiz steps trigger a flight
  whenever `StudentLessonOut.diamonds_awarded` (transient — 0 on every
  non-completing read) comes back `> 0`, since that's a completion the
  student themselves just performed. A tutor-side completion (grading a
  submission, resolving Need Help) still awards the diamonds but has no
  student-facing animation — the student isn't in that request; they'll
  just see the new balance next time the header refetches `GET /auth/me`.
  The balloon game always has a student in the request, so both its
  milestone and its quiz-pass rewards fly.

## 4. Spending

The avatar wardrobe shop (`docs/core/avatar.md` §2.2) is the one spend path
actually built: `AvatarItem.price` (0 = free), checked and deducted in
`accounts.services.purchase_avatar_item` — one conditional `UPDATE`
(`diamond_balance_cache__gte=item.price`) so two concurrent purchases can't
both succeed off a stale balance, same pattern as the earning side's atomic
`F()` updates. The unlock is recorded on `StudentProfile.unlocked_items`
(never touched by equip), so switching companions and back doesn't lose
access to anything already bought. Frontend: `components/profile/
avatar-wardrobe.tsx` — trying on a priced, not-yet-unlocked item opens a
confirm-purchase dialog; too little balance opens `NotEnoughDiamondsDialog`
instead.

`docs/core/avatar.md`'s home-decoration shop (§2.3) is spec only — nothing
under it is built yet.

## 5. Not gamification-by-diamonds, but adjacent

`achievements.ProgressBadge` — course-level badges keyed off a subject's
overall lesson-completion percent (not diamonds), shown on the Subject
detail page and "Мої досягнення". See `achievements/models.py` and
`achievements/api.py`. Independent system; doesn't earn or spend diamonds.
