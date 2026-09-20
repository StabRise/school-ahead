"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { renderGoogleButton, useGoogleSignIn } from "@/lib/google-sign-in";

// The size Google's own button is drawn at; ours is measured and the (invisible)
// Google button scaled to cover it — see below.
const GOOGLE_BUTTON_WIDTH = 240;
const GOOGLE_BUTTON_HEIGHT = 40;

// A sign-in button that goes straight to Google's account chooser: no stop at
// /login, no second click on a Google button. Google only hands a page an ID
// token through the button it renders itself (a plain link to
// accounts.google.com would come back with nothing for `POST /auth/google` to
// verify), so that button is laid over ours — stretched to our size and all but
// transparent — and the click lands on it. `children` is what the visitor sees,
// styled by `className` (use `group-hover:` variants: the overlay takes the
// pointer, so `hover:` on the visible button never fires).
//
// Until Google's script has loaded — or if it can't, or the client id isn't
// configured — the overlay stays out of the way and the button is an ordinary
// link to /login, whose page tries again.
export function GoogleSignInButton({
  className,
  errorAlign = "left",
  children,
}: {
  className: string;
  errorAlign?: "left" | "right";
  children: ReactNode;
}) {
  const t = useTranslations("Login");
  const status = useGoogleSignIn();
  const boxRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const overlay = overlayRef.current;
    if (!box || !overlay) return;
    let cancelled = false;

    const fit = () => {
      const { width, height } = box.getBoundingClientRect();
      overlay.style.transform = `scale(${width / GOOGLE_BUTTON_WIDTH}, ${height / GOOGLE_BUTTON_HEIGHT})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);

    renderGoogleButton(overlay, { theme: "outline", size: "large", width: GOOGLE_BUTTON_WIDTH }).then((ok) => {
      if (!cancelled) setReady(ok);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      overlay.replaceChildren();
    };
  }, []);

  return (
    <span ref={boxRef} className="group relative inline-flex">
      <Link href="/login" className={className} tabIndex={ready ? -1 : undefined} aria-hidden={ready || undefined}>
        {status === "pending" ? t("signingIn") : children}
      </Link>
      <div
        ref={overlayRef}
        style={{ width: GOOGLE_BUTTON_WIDTH, height: GOOGLE_BUTTON_HEIGHT }}
        className={`absolute left-0 top-0 origin-top-left overflow-hidden opacity-[0.01] ${ready ? "" : "pointer-events-none"}`}
      />
      <span role="status" className="sr-only">
        {status === "pending" ? t("signingIn") : ""}
      </span>
      {status === "error" && (
        <span
          role="alert"
          className={`absolute top-full mt-1 whitespace-nowrap text-xs text-red-600 ${errorAlign === "right" ? "right-0" : "left-0"}`}
        >
          {t("error")}
        </span>
      )}
    </span>
  );
}
