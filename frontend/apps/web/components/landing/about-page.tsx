"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const primaryButton = `rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-105 ${focusRing}`;
const secondaryButton = `rounded-xl border border-slate-900 bg-white/60 px-6 py-3 text-base font-medium text-slate-900 transition hover:bg-white ${focusRing}`;

// docs/core/gamification.md §1 — what a lesson earns.
const DIAMOND_REWARDS = [
  { amount: 1, key: "lesson" },
  { amount: 2, key: "ahead" },
  { amount: 5, key: "topic" },
  { amount: 10, key: "semester" },
] as const;

const PRESCHOOL_POINTS = ["preschool1", "preschool2", "preschool3", "preschool4", "preschool5", "preschool6"] as const;
const SCHOOL_POINTS = ["school1", "school2", "school3", "school4", "school5", "school6", "school7"] as const;

// The minigames of the preschool picker (packages/preschool-games'
// game-choice.tsx), each with the cover that picker shows and the public route
// it opens (games-page.tsx's GAME_PATH_SEGMENT). The Magic Cocktail folder only
// has `cover1.jpeg`, so it is the one game whose cover file isn't `cover.jpeg`.
const GAMES = [
  { key: "balloons", href: "/games/balloons", cover: "/static/ballons/cover.jpeg" },
  { key: "trains", href: "/games/trains", cover: "/static/trains/cover.jpeg" },
  { key: "reading", href: "/games/syllables", cover: "/static/syllables/cover.jpeg" },
  { key: "cards", href: "/games/syllables2", cover: "/static/syllables2/cover.jpeg" },
  { key: "stories", href: "/games/stories", cover: "/static/stories/cover.jpeg" },
  { key: "math", href: "/games/math", cover: "/static/math/cover.jpeg" },
  { key: "jumpingFrogs", href: "/games/jumping-frogs", cover: "/static/jumping-frogs/cover.jpeg" },
  { key: "cocktail", href: "/games/cocktail", cover: "/static/cocktail/cover1.jpeg" },
  { key: "cars", href: "/games/cars", cover: "/static/cars/cover.jpeg" },
] as const;

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-base leading-relaxed text-slate-700">
          <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-current opacity-40" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="mb-8 flex max-w-3xl flex-col gap-3">
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {lead && <p className="text-base text-slate-600 sm:text-lg">{lead}</p>}
    </div>
  );
}

// The "Дізнатися більше" page (`/about`), reached from the landing page: what
// the platform is, the two interface modes (docs/views/preschool/README.md and
// docs/interfaces/student/*), the preschool minigames (docs/preschool/games/*)
// and what a visitor can open without an account (docs/core/public_access.md).
export function AboutPage() {
  const t = useTranslations("About");

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-br from-rose-50 via-sky-50 to-violet-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-10 lg:gap-20 lg:py-16">
        <header className="flex max-w-3xl flex-col items-start gap-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">{t("eyebrow")}</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <p className="text-base text-slate-600 sm:text-lg">{t("lead")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className={primaryButton}>
              {t("primaryCta")}
            </Link>
            <Link href="/games" className={secondaryButton}>
              {t("secondaryCta")}
            </Link>
          </div>
        </header>

        <section aria-labelledby="about-ahead" className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 id="about-ahead" className="text-2xl font-semibold text-slate-900">
              {t("ahead.title")} <span aria-hidden="true">⭐</span>
            </h2>
            <p className="text-base leading-relaxed text-slate-700">{t("ahead.body")}</p>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-semibold text-slate-900">{t("ahead.diamondsTitle")}</h2>
            <p className="text-base leading-relaxed text-slate-700">{t("ahead.diamondsBody")}</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DIAMOND_REWARDS.map(({ amount, key }) => (
                <li key={key} className="flex items-center gap-3 rounded-xl bg-cyan-50 px-3 py-2">
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-cyan-700 shadow-sm">
                    +{amount}
                  </span>
                  <span className="text-sm text-slate-700">{t(`ahead.${key}`)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-500">{t("ahead.spend")}</p>
          </div>
        </section>

        <section aria-labelledby="about-modes">
          <SectionHeading id="about-modes" title={t("modes.title")} lead={t("modes.lead")} />

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="flex flex-col gap-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm sm:p-8">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  <span aria-hidden="true">🧸 </span>
                  {t("modes.preschoolName")}
                </h3>
                <p className="text-sm font-medium text-amber-800">{t("modes.preschoolFor")}</p>
              </div>
              <BulletList items={PRESCHOOL_POINTS.map((key) => t(`modes.${key}`))} />
            </article>

            <article className="flex flex-col gap-5 rounded-2xl border border-sky-200 bg-white p-6 shadow-sm sm:p-8">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  <span aria-hidden="true">🎒 </span>
                  {t("modes.schoolName")}
                </h3>
                <p className="text-sm font-medium text-sky-800">{t("modes.schoolFor")}</p>
              </div>
              <BulletList items={SCHOOL_POINTS.map((key) => t(`modes.${key}`))} />
            </article>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <figure className="flex flex-col gap-3">
              <Image
                src="/images/landing/school-today.png"
                alt={t("modes.shotTodayAlt")}
                width={1800}
                height={1044}
                sizes="(min-width: 1152px) 560px, (min-width: 1024px) 45vw, 100vw"
                className="h-auto w-full rounded-xl border border-slate-200 bg-white shadow-md"
              />
              <figcaption className="text-sm text-slate-500">{t("modes.shotToday")}</figcaption>
            </figure>
            <figure className="flex flex-col gap-3">
              <Image
                src="/images/landing/school-calendar.png"
                alt={t("modes.shotCalendarAlt")}
                width={1800}
                height={1132}
                sizes="(min-width: 1152px) 560px, (min-width: 1024px) 45vw, 100vw"
                className="h-auto w-full rounded-xl border border-slate-200 bg-white shadow-md"
              />
              <figcaption className="text-sm text-slate-500">{t("modes.shotCalendar")}</figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="about-games">
          <SectionHeading id="about-games" title={t("games.title")} lead={t("games.lead")} />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {GAMES.map(({ key, href, cover }) => (
              <li key={key}>
                <Link
                  href={href}
                  className={`flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${focusRing}`}
                >
                  <div className="relative aspect-[4/3] w-full bg-white">
                    <Image
                      src={cover}
                      alt=""
                      fill
                      sizes="(min-width: 1152px) 360px, (min-width: 640px) 45vw, 100vw"
                      className="object-contain"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 border-t border-slate-100 p-5">
                    <h3 className="text-lg font-semibold text-slate-900">{t(`games.${key}Title`)}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{t(`games.${key}Body`)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="about-catalogue"
          className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="about-catalogue" className="text-2xl font-semibold text-slate-900">
            {t("catalogue.title")}
          </h2>
          <p className="max-w-3xl text-base leading-relaxed text-slate-700">{t("catalogue.body")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/subjects" className={secondaryButton}>
              {t("catalogue.subjects")}
            </Link>
            <Link href="/games/stories" className={secondaryButton}>
              {t("catalogue.stories")}
            </Link>
            <Link href="/games" className={secondaryButton}>
              {t("catalogue.games")}
            </Link>
          </div>
        </section>

        <section aria-labelledby="about-tutor" className="flex max-w-3xl flex-col gap-3">
          <h2 id="about-tutor" className="text-2xl font-semibold tracking-tight text-slate-900">
            {t("tutor.title")}
          </h2>
          <p className="text-base leading-relaxed text-slate-700">{t("tutor.body")}</p>
        </section>

        <section
          aria-labelledby="about-cta"
          className="flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-b from-sky-400 to-blue-600 px-6 py-12 text-center text-white shadow-lg shadow-blue-500/20"
        >
          <h2 id="about-cta" className="text-2xl font-semibold sm:text-3xl">
            {t("cta.title")}
          </h2>
          <p className="max-w-xl text-base text-sky-50">{t("cta.body")}</p>
          <Link
            href="/login"
            className={`rounded-xl bg-white px-6 py-3 text-base font-semibold text-blue-700 shadow-md transition hover:bg-sky-50 ${focusRing}`}
          >
            {t("primaryCta")}
          </Link>
        </section>
      </div>
    </div>
  );
}
