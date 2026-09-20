"use client";

import { useTranslations } from "next-intl";
import { useAuthStore } from "@school-ahead/api-client";
import { LandingPage } from "@/components/landing/landing-page";
import { StudentDashboard } from "@/components/student-dashboard";
import { TutorDashboard } from "@/components/tutor-dashboard";

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
    return <LandingPage />;
  }

  if (user.role === "student") {
    return <StudentDashboard />;
  }

  if (user.role === "tutor") {
    return <TutorDashboard />;
  }

  return <WelcomeBack name={user.name || user.email} />;
}
