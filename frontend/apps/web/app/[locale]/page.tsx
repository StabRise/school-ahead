"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuthStore } from "@school-ahead/api-client";
import { StudentDashboard } from "@/components/student-dashboard";
import { TutorDashboard } from "@/components/tutor-dashboard";

function GuestHome() {
  const t = useTranslations("Home");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t("guestTitle")}</h1>
      <p className="text-sm text-gray-600">{t("guestSubtitle")}</p>
      <Link
        href="/login"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {t("cta")}
      </Link>
    </div>
  );
}

function WelcomeBack({ name }: { name: string }) {
  const t = useTranslations("Home");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t("welcomeBack", { name })}</h1>
    </div>
  );
}

export default function HomePage() {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <GuestHome />;
  }

  if (user.role === "student") {
    return <StudentDashboard />;
  }

  if (user.role === "tutor") {
    return <TutorDashboard />;
  }

  return <WelcomeBack name={user.name || user.email} />;
}
