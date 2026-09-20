"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Link } from "@/i18n/navigation";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

// What a visitor can open without an account (lib/public-paths.ts): the
// read-only subject catalogue, the fairy tales and the minigames. Each card's
// art is a 210-250 x 190 JPEG on a white ground, so it is multiplied into the
// white card rather than shown in a box of its own.
const EXPLORE_CARDS = [
  { key: "subjects", href: "/subjects", image: "/images/landing/subjects.jpg", width: 210, note: true },
  { key: "stories", href: "/games/stories", image: "/images/landing/stories.jpg", width: 210, note: false },
  { key: "games", href: "/games", image: "/images/landing/games.jpg", width: 250, note: false },
] as const;

// The home page (`/`) of a visitor who isn't signed in. Signed-in users get
// their dashboard instead — see app/[locale]/page.tsx.
export function LandingPage() {
  const t = useTranslations("Landing");

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-br from-rose-50 via-sky-50 to-violet-50">
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 py-10 lg:grid-cols-2 lg:gap-12 lg:py-16">
        <div className="flex flex-col items-start gap-6 lg:order-2">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            <span className="block">{t("heroTitleLead")}</span>
            <span className="block">{t("heroTitleTail")}</span>
          </h1>
          <p className="max-w-xl text-base text-slate-500 sm:text-lg">{t("heroSubtitle")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <GoogleSignInButton
              className={`rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition group-hover:brightness-105 ${focusRing}`}
            >
              {t("signIn")}
            </GoogleSignInButton>
            <Link
              href="/about"
              className={`rounded-xl border border-slate-900 bg-white/60 px-6 py-3 text-base font-medium text-slate-900 transition hover:bg-white ${focusRing}`}
            >
              {t("learnMore")}
            </Link>
          </div>
        </div>

        {/* The illustration sits on the page's own gradient: its corners fade
            out so the picture's slightly different background never shows as
            a box. */}
        <Image
          src="/images/landing/hero.jpg"
          alt={t("heroImageAlt")}
          width={1240}
          height={980}
          preload
          sizes="(min-width: 1024px) 560px, 100vw"
          className="mx-auto h-auto w-full max-w-xl [mask-image:radial-gradient(ellipse_farthest-corner,black_62%,transparent_100%)] lg:order-1 lg:max-w-none"
        />
      </section>

      <section aria-label={t("exploreLabel")} className="px-6 pb-12">
        <ul className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-3 md:gap-8">
          {EXPLORE_CARDS.map(({ key, href, image, width, note }) => (
            <li key={key}>
              <Link
                href={href}
                className={`flex h-full items-center gap-6 rounded-2xl border border-slate-200 bg-white px-8 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${focusRing}`}
              >
                <Image
                  src={image}
                  alt=""
                  width={width}
                  height={190}
                  className="h-24 w-auto shrink-0 mix-blend-multiply"
                />
                <span className="text-xl font-semibold text-slate-900">
                  {t(key)}
                  {note && <span className="block text-sm font-normal text-slate-500">{t("subjectsNote")}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
