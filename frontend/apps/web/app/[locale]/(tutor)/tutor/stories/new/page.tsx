import { hasLocale } from "next-intl";
import { getPreschool } from "@school-ahead/api-client/server/preschool/preschool";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Creates the Story object immediately (server-side, via the tutor-only
// create endpoint — unpublished by default, see backend/preschool/models.py)
// and redirects straight to its own edit page, rather than showing a
// separate "new story" form first. This gives the editor a real story id
// from the very first moment, so the asset sidebar (drag-and-drop images/
// audio/video into the text) works immediately too — it needs an id to
// attach uploads to. The story stays invisible to the game until the
// tutor explicitly publishes it from the edit page.
export default async function NewStoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const resolvedLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;

  const story = await getPreschool().createTutorPreschoolStory({ title: "Нова казка" });
  redirect({ href: `/tutor/stories/${story.id}`, locale: resolvedLocale });
}
