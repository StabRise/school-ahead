"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { renderGoogleButton, useGoogleSignIn } from "@/lib/google-sign-in";

export default function LoginPage() {
  const t = useTranslations("Login");
  const status = useGoogleSignIn();
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  // The sign-in itself (Google's credential -> POST /auth/google -> the auth
  // store, then on to `/`) is shared with the header's and the landing page's
  // buttons — see lib/google-sign-in.ts. This page only draws Google's button.
  useEffect(() => {
    const container = buttonContainerRef.current;
    if (!container) return;
    renderGoogleButton(container, { theme: "outline", size: "large" });
    return () => container.replaceChildren();
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-gray-600">{t("subtitle")}</p>
        <div ref={buttonContainerRef} />
        {status === "pending" && <p className="text-sm text-gray-500">{t("signingIn")}</p>}
        {status === "error" && <p className="text-sm text-red-600">{t("error")}</p>}
      </div>
    </div>
  );
}
