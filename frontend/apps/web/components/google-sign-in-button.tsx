"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { renderGoogleButton, useGoogleSignIn } from "@/lib/google-sign-in";

// The size Google's own button is drawn at; ours is measured and the (invisible)
// Google button scaled to cover it — see below.
const GOOGLE_BUTTON_WIDTH = 240;
const GOOGLE_BUTTON_HEIGHT = 40;

// A sign-in button that goes straight to Google's account chooser: no page of ours in
// between (there is no login page), no second click on a Google button. Google only hands a page an ID
// token through the button it renders itself (a plain link to
// accounts.google.com would come back with nothing for `POST /auth/google` to
// verify), so that button is laid over ours — stretched to our size and all but
// transparent — and the click lands on it. `children` is what the visitor sees,
// styled by `className` (use `group-hover:` variants: the overlay takes the
// pointer, so `hover:` on the visible button never fires).
//
// Until Google's script has loaded — or if it can't, or the client id isn't
// configured — the overlay stays out of the way and the button is an ordinary one that
// tries to load Google again when pressed (the next press then reaches Google), and
// says so when it still can't.
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
  const [unavailable, setUnavailable] = useState(false);

  const draw = useCallback(
    () => renderGoogleButton(overlayRef.current as HTMLElement, { theme: "outline", size: "large", width: GOOGLE_BUTTON_WIDTH }),
    [],
  );

  // Pressed before Google was there: ask for it again.
  const retry = async () => {
    if (!overlayRef.current) return;
    const ok = await draw();
    setReady(ok);
    setUnavailable(!ok);
  };

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

    draw().then((ok) => {
      if (!cancelled) setReady(ok);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      overlay.replaceChildren();
    };
  }, [draw]);

  const message = status === "error" ? t("error") : unavailable ? t("unavailable") : null;

  return (
    <span ref={boxRef} className="group relative inline-flex">
      <button
        type="button"
        onClick={retry}
        className={className}
        tabIndex={ready ? -1 : undefined}
        aria-hidden={ready || undefined}
      >
        {status === "pending" ? t("signingIn") : children}
      </button>
      <div
        ref={overlayRef}
        style={{ width: GOOGLE_BUTTON_WIDTH, height: GOOGLE_BUTTON_HEIGHT }}
        className={`absolute left-0 top-0 origin-top-left overflow-hidden opacity-[0.01] ${ready ? "" : "pointer-events-none"}`}
      />
      <span role="status" className="sr-only">
        {status === "pending" ? t("signingIn") : ""}
      </span>
      {message && (
        <span
          role="alert"
          className={`absolute top-full mt-1 whitespace-nowrap text-xs text-red-600 ${errorAlign === "right" ? "right-0" : "left-0"}`}
        >
          {message}
        </span>
      )}
    </span>
  );
}
